import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { PrismaService } from "../database/prisma.service";
import { readBoundedProviderJson } from "../execution/provider-json";
import type { CredentialVaultService } from "./credential-vault.service";
import { shopifyShop } from "./shopify-oauth-protocol";

const opaque = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(value);
const scopes = ["read_orders", "read_products"];

export function shopifyOAuthConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID, clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const redirect = new URL(process.env.SHOPIFY_REDIRECT_URI ?? "invalid:");
  if (!opaque(clientId) || !opaque(clientSecret) || redirect.username || redirect.password || redirect.search || redirect.hash || !(redirect.protocol === "https:" || redirect.protocol === "http:" && redirect.hostname === "localhost")) throw new Error("Shopify OAuth is not configured");
  return { clientId, clientSecret, redirectUri: redirect.href };
}

async function exchange(shop: string, grant: { code: string } | { refreshToken: string }) {
  if (!shopifyShop(shop)) throw new Error("Invalid Shopify shop");
  const { clientId, clientSecret } = shopifyOAuthConfig();
  const body = "code" in grant ? { client_id: clientId, client_secret: clientSecret, code: grant.code, expiring: "1" } : { client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: grant.refreshToken };
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error("Shopify authorization failed"); }
  const raw = await readBoundedProviderJson(response);
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (!opaque(row.access_token) || !opaque(row.refresh_token) || typeof row.expires_in !== "number" || !Number.isFinite(row.expires_in) || row.expires_in <= 0 || row.expires_in > 86400 * 30 || typeof row.scope !== "string" || row.scope.length > 4096) throw new Error("Invalid Shopify authorization");
  const granted = row.scope.split(",");
  if (scopes.some((scope) => !granted.includes(scope) && !granted.includes(`write_${scope.slice(5)}`))) throw new Error("Missing Shopify scope");
  return { accessToken: row.access_token, refreshToken: row.refresh_token, expiresAt: Date.now() + row.expires_in * 1000, grantedScopes: granted };
}

/** One lock per shop prevents concurrent authorization/refresh from retiring a token another worker just saved. */
export async function saveShopifyAuthorization(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, userId: string, shop: string, code: string, credentialId?: string) {
  if (!shopifyShop(shop) || !opaque(code)) throw new BadRequestException({ code: "SHOPIFY_OAUTH_INVALID", message: "Shopify authorization is invalid." });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`shopify:${shop}`}, 0))::text AS locked`;
    const credential = credentialId
      ? await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.SHOPIFY, shopifyInstallationShop: shop } })
      : await tx.credential.findFirst({ where: { workspaceId, provider: CredentialProvider.SHOPIFY, shopifyInstallationShop: shop } });
    if (credentialId && !credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Shopify connection not found." });
    const token = await exchange(shop, { code });
    await tx.shopifyInstallation.upsert({ where: { shop }, create: { shop, encryptedData: vault.encrypt(token) }, update: { encryptedData: vault.encrypt(token) } });
    const id = credential?.id ?? (await tx.credential.create({ data: { workspaceId, provider: CredentialProvider.SHOPIFY, label: `Shopify · ${shop.slice(0, -".myshopify.com".length).slice(0, 45)} · ${randomUUID().slice(0, 8)}`, encryptedData: vault.encrypt({ shop: shop.slice(0, -".myshopify.com".length) }), shopifyInstallationShop: shop } })).id;
    await tx.shopifyInstallation.updateMany({ where: { shop, NOT: { credentialIds: { has: id } } }, data: { credentialIds: { push: id } } });
    await tx.shopifyInstallation.updateMany({ where: { shop, NOT: { workspaceIds: { has: workspaceId } } }, data: { workspaceIds: { push: workspaceId } } });
    await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.shopify_oauth_connected", targetType: "credential", targetId: id } });
    return id;
  }, { maxWait: 5000, timeout: 25_000 });
}

export async function shopifyOAuthCredential(prisma: PrismaService, vault: CredentialVaultService, workspaceId: string, credentialId: string, shop: string) {
  if (!shopifyShop(shop)) throw new BadRequestException({ code: "SHOPIFY_RECONNECT_REQUIRED", message: "Reconnect this Shopify store." });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`shopify:${shop}`}, 0))::text AS locked`;
    const credential = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.SHOPIFY, shopifyInstallationShop: shop } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "Shopify connection not found." });
    const installation = await tx.shopifyInstallation.findUnique({ where: { shop } });
    if (!installation?.encryptedData) throw new BadRequestException({ code: "SHOPIFY_RECONNECT_REQUIRED", message: "Reconnect this Shopify store." });
    const data = vault.decrypt(installation.encryptedData);
    if (!opaque(data.accessToken) || !opaque(data.refreshToken) || typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt)) throw new BadRequestException({ code: "SHOPIFY_RECONNECT_REQUIRED", message: "Reconnect this Shopify store." });
    if (data.expiresAt > Date.now() + 60_000) return { shop: shop.slice(0, -".myshopify.com".length), token: data.accessToken };
    try {
      const updated = await exchange(shop, { refreshToken: data.refreshToken });
      await tx.shopifyInstallation.update({ where: { shop }, data: { encryptedData: vault.encrypt(updated) } });
      return { shop: shop.slice(0, -".myshopify.com".length), token: updated.accessToken };
    } catch { throw new ConflictException({ code: "SHOPIFY_RECONNECT_REQUIRED", message: "Shopify authorization could not be renewed. Reconnect this store." }); }
  }, { maxWait: 5000, timeout: 25_000 });
}
