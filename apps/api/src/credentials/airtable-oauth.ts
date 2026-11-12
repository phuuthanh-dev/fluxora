import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { PrismaService } from "../database/prisma.service";
import { readBoundedProviderJson } from "../execution/provider-json";
import type { CredentialVaultService } from "./credential-vault.service";

const opaque = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(value);
export type AirtableAuthorization = { accessToken: string; refreshToken: string; expiresAt: number; airtableUserId: string; authType: "oauth"; refreshPending?: boolean; refreshStartedAt?: number };

export function airtableOAuthConfig() {
  const clientId = process.env.AIRTABLE_CLIENT_ID, clientSecret = process.env.AIRTABLE_CLIENT_SECRET;
  const redirect = new URL(process.env.AIRTABLE_REDIRECT_URI ?? "invalid:");
  if (!opaque(clientId) || !opaque(clientSecret) || redirect.username || redirect.password || redirect.search || redirect.hash || !(redirect.protocol === "https:" || redirect.protocol === "http:" && redirect.hostname === "localhost")) throw new Error("Airtable OAuth is not configured");
  return { clientId, clientSecret, redirectUri: redirect.href };
}

export async function exchangeAirtableToken(grant: { code: string; verifier: string } | { refreshToken: string }) {
  const config = airtableOAuthConfig();
  const body: Record<string, string> = "code" in grant ? { grant_type: "authorization_code", client_id: config.clientId, code: grant.code, code_verifier: grant.verifier, redirect_uri: config.redirectUri } : { grant_type: "refresh_token", client_id: config.clientId, refresh_token: grant.refreshToken };
  const response = await fetch("https://airtable.com/oauth2/v1/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error("Airtable authorization failed"); }
  const raw = await readBoundedProviderJson(response);
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (!opaque(data.access_token) || !opaque(data.refresh_token) || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 86400 * 30) throw new Error("Invalid Airtable authorization");
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

export async function identifyAirtable(accessToken: string) {
  const response = await fetch("https://api.airtable.com/v0/meta/whoami", { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error("Airtable identity unavailable"); }
  const raw = await readBoundedProviderJson(response);
  const id = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).id : undefined;
  if (typeof id !== "string" || !/^usr[A-Za-z0-9]{5,64}$/.test(id)) throw new Error("Invalid Airtable identity");
  return id;
}

export async function requireAirtableTarget(prisma: PrismaService, workspaceId: string, credentialId: string) {
  const row = await prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.AIRTABLE } });
  if (!row) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Airtable connection not found." });
  return row;
}

export async function saveAirtableAuthorization(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, userId: string, data: AirtableAuthorization, credentialId?: string) {
  let id: string;
  if (credentialId) {
    const previous = await requireAirtableTarget(prisma, workspaceId, credentialId);
    if (vault.decrypt(previous.encryptedData).airtableUserId !== data.airtableUserId) throw new ConflictException({ code: "AIRTABLE_ACCOUNT_MISMATCH", message: "Reconnect the same Airtable account, or create a new connection." });
    const updated = await prisma.credential.updateMany({ where: { id: credentialId, workspaceId, encryptedData: previous.encryptedData }, data: { encryptedData: vault.encrypt(data) } });
    if (!updated.count) throw new ConflictException({ code: "CREDENTIAL_CHANGED", message: "The connection changed. Try again." });
    id = credentialId;
  } else {
    const suffix = randomUUID().slice(0, 8);
    id = (await prisma.credential.create({ data: { workspaceId, provider: CredentialProvider.AIRTABLE, label: `Airtable · ${suffix}`, encryptedData: vault.encrypt(data) } })).id;
  }
  await prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.airtable_oauth_connected", targetType: "credential", targetId: id } });
}

/** Claim before refresh: after an uncertain response, never reuse a rotating refresh token. */
export async function airtableAccessToken(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, credentialId: string) {
  const previous = await requireAirtableTarget(prisma, workspaceId, credentialId);
  const data = vault.decrypt(previous.encryptedData);
  if (data.refreshPending === true && typeof data.refreshStartedAt === "number" && Date.now() - data.refreshStartedAt < 30_000) throw new ConflictException({ code: "CREDENTIAL_CHANGED", message: "The Airtable connection is being updated. Try again." });
  if (data.authType !== "oauth" || !opaque(data.accessToken) || !opaque(data.refreshToken) || typeof data.expiresAt !== "number" || !opaque(data.airtableUserId) || data.refreshPending === true) throw new BadRequestException({ code: "AIRTABLE_RECONNECT_REQUIRED", message: "Reconnect this Airtable account." });
  if (data.expiresAt > Date.now() + 60_000) return data.accessToken;
  const claimed = vault.encrypt({ ...data, refreshPending: true, refreshStartedAt: Date.now() });
  const claim = await prisma.credential.updateMany({ where: { id: credentialId, workspaceId, encryptedData: previous.encryptedData }, data: { encryptedData: claimed } });
  if (!claim.count) throw new ConflictException({ code: "CREDENTIAL_CHANGED", message: "The Airtable connection is being updated. Try again." });
  try {
    const updated = await exchangeAirtableToken({ refreshToken: data.refreshToken });
    const saved = await prisma.credential.updateMany({ where: { id: credentialId, workspaceId, encryptedData: claimed }, data: { encryptedData: vault.encrypt({ ...updated, airtableUserId: data.airtableUserId, authType: "oauth" }) } });
    if (!saved.count) throw new Error("Connection changed");
    return updated.accessToken;
  } catch { throw new BadRequestException({ code: "AIRTABLE_RECONNECT_REQUIRED", message: "Airtable authorization could not be renewed safely. Reconnect this account." }); }
}
