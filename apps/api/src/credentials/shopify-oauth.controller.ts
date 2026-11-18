import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "./credential.service";
import { CredentialVaultService } from "./credential-vault.service";
import { shopifyOAuthConfig, saveShopifyAuthorization } from "./shopify-oauth";
import { shopifyShop, verifyShopifyOAuthQuery } from "./shopify-oauth-protocol";
import { ShopifyOAuthStateService } from "./shopify-oauth-state.service";

@Controller()
export class ShopifyOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService, @Inject(ShopifyOAuthStateService) private readonly states: ShopifyOAuthStateService, @Inject(AuthService) private readonly auth: AuthService, @Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialVaultService) private readonly vault: CredentialVaultService) {}

  @Get("workspaces/:workspaceId/credentials/shopify/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("shop") input: string | undefined, @Query("credentialId") credentialId?: string) {
    response.setHeader("Cache-Control", "no-store");
    const userId = request.currentUser?.id; if (!userId) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, userId);
    const shop = shopifyShop(input);
    if (!shop || credentialId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(credentialId)) return failure(response, "invalid", workspaceId);
    if (credentialId) {
      const existing = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider: CredentialProvider.SHOPIFY, shopifyInstallationShop: shop } });
      if (!existing) return failure(response, "invalid", workspaceId);
    }
    try {
      const config = shopifyOAuthConfig();
      const issued = await this.states.issue({ workspaceId, userId, shop, credentialId }, request, response);
      const url = new URL(`https://${shop}/admin/oauth/authorize`);
      url.search = new URLSearchParams({ client_id: config.clientId, scope: "read_orders,read_products", redirect_uri: config.redirectUri, state: issued.state }).toString();
      return response.redirect(url.href);
    } catch { return failure(response, "unavailable", workspaceId); }
  }

  @Get("oauth/shopify/callback")
  async callback(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    let workspaceId: string | undefined;
    try {
      const query = new URLSearchParams((request.originalUrl ?? "").split("?")[1] ?? "");
      const config = shopifyOAuthConfig();
      if (!verifyShopifyOAuthQuery(query, config.clientSecret)) throw new Error("Invalid callback");
      const shop = shopifyShop(query.get("shop")), state = query.get("state"), code = query.get("code");
      if (!shop || !state || state.length > 4096 || !code || code.length > 4096) throw new Error("Invalid callback");
      const session = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("workflow_session="))?.slice("workflow_session=".length);
      const user = await this.auth.getCurrentUser(session ? decodeURIComponent(session) : undefined);
      const { state: consumed } = await this.states.consume(state, request, response);
      if (consumed.userId !== user.id || consumed.shop !== shop) throw new Error("Invalid state");
      workspaceId = consumed.workspaceId; await this.credentials.requireOwner(workspaceId, user.id);
      await saveShopifyAuthorization(this.prisma, this.vault, workspaceId, user.id, shop, code, consumed.credentialId);
      const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      target.searchParams.set("workspace", workspaceId); target.searchParams.set("connected", "shopify"); return response.redirect(target.href);
    } catch { return failure(response, "failed", workspaceId); }
  }
}
function failure(response: Response, reason: string, workspaceId?: string) {
  const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  target.searchParams.set("shopify_oauth", reason); if (workspaceId) target.searchParams.set("workspace", workspaceId); return response.redirect(target.href);
}
