import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { PrismaService } from "../database/prisma.service";
import type { CredentialVaultService } from "./credential-vault.service";
import { readBoundedProviderJson } from "../execution/provider-json";
import { NodeFailure } from "../execution/node-failure";
import { createHmac } from "node:crypto";

const opaque = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(v);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const jiraAccountId = (value: unknown): value is string => typeof value === "string" && value !== "unknown" && /^[A-Za-z0-9:-]{1,128}$/.test(value);
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export type JiraAuthorization = { accessToken: string; refreshToken: string; cloudId: string; siteName: string; accountId: string };
export const jiraScopes = "read:jira-work write:jira-work read:me offline_access";
export function jiraOAuthConfig() {
  const clientId = process.env.JIRA_CLIENT_ID, clientSecret = process.env.JIRA_CLIENT_SECRET;
  const redirect = new URL(process.env.JIRA_REDIRECT_URI ?? "invalid:");
  if (!opaque(clientId) || !opaque(clientSecret) || redirect.username || redirect.password || redirect.search || redirect.hash || !(redirect.protocol === "https:" || redirect.protocol === "http:" && redirect.hostname === "localhost")) throw new Error("Jira OAuth is not configured");
  return { clientId, clientSecret, redirectUri: redirect.href };
}
async function providerJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error("Jira authorization failed"); }
  return readBoundedProviderJson(response);
}
export async function exchangeJiraToken(grant: { code: string } | { refreshToken: string }): Promise<{ accessToken: string; refreshToken: string }> {
  const config = jiraOAuthConfig();
  const raw = object(await providerJson("https://auth.atlassian.com/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify("code" in grant ? { grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret, code: grant.code, redirect_uri: config.redirectUri } : { grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret, refresh_token: grant.refreshToken }) }));
  if (!opaque(raw.access_token) || !opaque(raw.refresh_token)) throw new Error("Invalid Jira authorization");
  return { accessToken: raw.access_token, refreshToken: raw.refresh_token };
}
export async function identifyJiraAuthorization(tokens: { accessToken: string; refreshToken: string }): Promise<JiraAuthorization> {
  const headers = { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" };
  const [sites, profile] = await Promise.all([providerJson("https://api.atlassian.com/oauth/token/accessible-resources", { headers }), providerJson("https://api.atlassian.com/me", { headers })]);
  if (!Array.isArray(sites) || sites.length !== 1) throw new Error("Select exactly one Jira site");
  const site = object(sites[0]), person = object(profile);
  if (typeof site.id !== "string" || !uuid.test(site.id) || typeof site.name !== "string" || !site.name.trim() || site.name.includes(tokens.accessToken) || site.name.includes(tokens.refreshToken) || !jiraAccountId(person.account_id)) throw new Error("Invalid Jira site or account");
  return { ...tokens, cloudId: site.id.toLowerCase(), siteName: site.name.slice(0, 100), accountId: person.account_id };
}
export async function requireJiraReconnect(prisma: PrismaService, workspaceId: string, credentialId: string) {
  const credential = await prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.JIRA } });
  if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Jira connection not found." });
  return credential;
}
export async function saveJiraAuthorization(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, userId: string, data: JiraAuthorization, credentialId?: string) {
  if (!jiraAccountId(data.accountId)) throw new Error("Invalid Jira account");
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey || Buffer.from(encryptionKey, "base64").length !== 32) throw new Error("Encryption key required");
  const accountHash = createHmac("sha256", Buffer.from(encryptionKey, "base64")).update("jira-privacy-account\0").update(data.accountId).digest("hex");
  const encryptedData = vault.encrypt(data);
  await prisma.$transaction(async (tx) => {
  let id: string;
  if (credentialId) {
    const existing = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.JIRA } });
    if (!existing) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Jira connection not found." });
    const previous = vault.decrypt(existing.encryptedData);
    if (previous.cloudId !== data.cloudId || previous.accountId !== data.accountId) throw new ConflictException({ code: "JIRA_IDENTITY_MISMATCH", message: "Reconnect the same Jira site and account, or add a new connection." });
    const updated = await tx.credential.updateMany({ where: { id: credentialId, workspaceId, encryptedData: existing.encryptedData }, data: { encryptedData } });
    if (!updated.count) throw new ConflictException({ code: "CREDENTIAL_CHANGED", message: "The connection changed. Try again." });
    id = credentialId;
  } else {
    const label = `Jira · ${data.siteName.slice(0, 40)} · ${data.cloudId.slice(0, 8)}`;
    id = (await tx.credential.create({ data: { workspaceId, provider: CredentialProvider.JIRA, label, encryptedData } })).id;
  }
  const now = new Date();
  await tx.jiraPrivacyAccount.upsert({ where: { accountHash }, create: { accountHash, encryptedAccountId: vault.encrypt({ accountId: data.accountId }), oldestDataAt: now, nextReportAt: now }, update: {} });
  await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.jira_oauth_connected", targetType: "credential", targetId: id } });
  });
}
/** Refresh once only after a definite authentication failure; serialize refreshes across workers. */
export async function runJiraAuthorized<T>(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, credentialId: string, operation: () => Promise<T>): Promise<T> {
  const initial = await requireJiraReconnect(prisma, workspaceId, credentialId);
  try { return await operation(); }
  catch (error) { if (!(error instanceof NodeFailure) || error.statusCode !== 401) throw error; }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Credential" WHERE id = ${credentialId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
      const current = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.JIRA } });
      if (!current) throw new Error("Connection removed");
      if (current.encryptedData !== initial.encryptedData) return;
      const stored = vault.decrypt(current.encryptedData);
      if (!opaque(stored.refreshToken)) throw new Error("Reconnect required");
      const renewed = await exchangeJiraToken({ refreshToken: stored.refreshToken });
      await tx.credential.update({ where: { id: current.id }, data: { encryptedData: vault.encrypt({ ...stored, ...renewed }) } });
    }, { maxWait: 5000, timeout: 20_000 });
  } catch { throw new BadRequestException({ code: "JIRA_RECONNECT_REQUIRED", message: "Jira authorization could not be renewed. Reconnect this site." }); }
  return operation();
}
