import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { PrismaService } from "../database/prisma.service";
import type { CredentialVaultService } from "./credential-vault.service";
import { readBoundedProviderJson } from "../execution/provider-json";
import { NodeFailure } from "../execution/node-failure";

const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const opaque = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(value);
export type NotionAuthorization = { token: string; refreshToken: string; notionWorkspaceId: string; notionWorkspaceName: string; botId: string; authType: "oauth" };
export function isNotionOAuth(data: Record<string, unknown>) { return data.authType === "oauth"; }

export function notionOAuthConfig() {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirect = new URL(process.env.NOTION_REDIRECT_URI ?? "invalid:");
  if (!opaque(clientId) || !opaque(clientSecret) || redirect.username || redirect.password || redirect.search || redirect.hash || !(redirect.protocol === "https:" || redirect.protocol === "http:" && redirect.hostname === "localhost")) throw new Error("Notion OAuth is not configured");
  return { clientId, clientSecret, redirectUri: redirect.href };
}

export async function exchangeNotionToken(grant: { code: string } | { refreshToken: string }): Promise<NotionAuthorization> {
  const config = notionOAuthConfig();
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "content-type": "application/json", "notion-version": "2025-09-03" },
    body: JSON.stringify("code" in grant ? { grant_type: "authorization_code", code: grant.code, redirect_uri: config.redirectUri } : { grant_type: "refresh_token", refresh_token: grant.refreshToken }),
  });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error("Notion authorization failed"); }
  const raw = await readBoundedProviderJson(response);
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (!opaque(data.access_token) || !opaque(data.refresh_token) || typeof data.workspace_id !== "string" || !identifier.test(data.workspace_id) || typeof data.bot_id !== "string" || !identifier.test(data.bot_id)) throw new Error("Invalid Notion authorization");
  return { token: data.access_token, refreshToken: data.refresh_token, notionWorkspaceId: data.workspace_id.toLowerCase(), botId: data.bot_id.toLowerCase(), notionWorkspaceName: typeof data.workspace_name === "string" ? data.workspace_name.slice(0, 100) : "Notion workspace", authType: "oauth" };
}

export async function requireNotionReconnect(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, credentialId: string) {
  const existing = await prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.NOTION } });
  if (!existing || !isNotionOAuth(vault.decrypt(existing.encryptedData))) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Notion OAuth connection not found." });
  return existing;
}

export async function saveNotionAuthorization(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, userId: string, data: NotionAuthorization, credentialId?: string) {
  const encryptedData = vault.encrypt(data);
  let id: string;
  if (credentialId) {
    const existing = await requireNotionReconnect(prisma, vault, workspaceId, credentialId);
    const previous = vault.decrypt(existing.encryptedData);
    if (previous.notionWorkspaceId !== data.notionWorkspaceId || previous.botId !== data.botId) throw new ConflictException({ code: "NOTION_WORKSPACE_MISMATCH", message: "Reconnect the same Notion installation, or add a new connection." });
    const updated = await prisma.credential.updateMany({ where: { id: credentialId, workspaceId, encryptedData: existing.encryptedData }, data: { encryptedData } });
    if (!updated.count) throw new ConflictException({ code: "CREDENTIAL_CHANGED", message: "The connection changed. Try again." });
    id = credentialId;
  } else {
    const label = `Notion · ${data.notionWorkspaceName.slice(0, 35)} · ${data.botId.slice(0, 8)}`;
    id = (await prisma.credential.create({ data: { workspaceId, provider: CredentialProvider.NOTION, label, encryptedData } })).id;
  }
  await prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.notion_oauth_connected", targetType: "credential", targetId: id } });
}

/** Only a definite 401 can renew a grant. Never retry uncertain writes or 403. */
export async function runNotionAuthorized<T>(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, credentialId: string, operation: () => Promise<T>): Promise<T> {
  const initial = await prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.NOTION } });
  if (!initial) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Notion connection not found." });
  const initialData = vault.decrypt(initial.encryptedData);
  try { return await operation(); }
  catch (error) {
    if (!isNotionOAuth(initialData) || !(error instanceof NodeFailure) || error.statusCode !== 401) throw error;
  }
  try {
    await prisma.$transaction(async (tx) => {
      // A DB row lock serializes refreshes across API/worker processes.
      await tx.$queryRaw`SELECT id FROM "Credential" WHERE id = ${credentialId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
      const current = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.NOTION } });
      if (!current) throw new Error("Connection removed");
      if (current.encryptedData !== initial.encryptedData) return;
      const stored = vault.decrypt(current.encryptedData);
      if (!isNotionOAuth(stored) || !opaque(stored.refreshToken)) throw new Error("Reconnect required");
      const renewed = await exchangeNotionToken({ refreshToken: stored.refreshToken });
      if (renewed.notionWorkspaceId !== stored.notionWorkspaceId || renewed.botId !== stored.botId) throw new Error("Installation mismatch");
      await tx.credential.update({ where: { id: current.id }, data: { encryptedData: vault.encrypt(renewed) } });
    }, { maxWait: 5000, timeout: 20_000 });
  } catch { throw new BadRequestException({ code: "NOTION_RECONNECT_REQUIRED", message: "Notion authorization could not be renewed. Reconnect this workspace." }); }
  return operation();
}
