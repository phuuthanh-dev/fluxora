import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AccountRequestGuard } from "../auth/account-request.guard";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { BillingService } from "./billing.service";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";

@Controller()
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get("billing/availability") @Header("Cache-Control", "no-store")
  publicAvailability() { return this.billing.publicAvailability(); }

  @Post("workspaces/:workspaceId/billing/checkout")
  @UseGuards(AuthenticationGuard, AccountRequestGuard)
  @Header("Cache-Control", "no-store")
  checkout(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const plan = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).plan : undefined;
    const upgradeFromPaidUntil = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).upgradeFromPaidUntil : undefined;
    const confirmUpgrade = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).confirmUpgrade : undefined;
    const method = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).method : undefined;
    return this.billing.createCheckout(workspaceId, req.currentUser!.id, plan, upgradeFromPaidUntil, confirmUpgrade, method);
  }

  @Get("workspaces/:workspaceId/billing/orders/latest")
  @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  async latest(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest) {
    return { order: await this.billing.latest(workspaceId, req.currentUser!.id) };
  }

  @Get("workspaces/:workspaceId/billing/orders/:orderId")
  @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  status(@Param("workspaceId") workspaceId: string, @Param("orderId") orderId: string, @Req() req: AuthenticatedRequest) {
    return this.billing.status(workspaceId, req.currentUser!.id, orderId);
  }

  @Post("workspaces/:workspaceId/billing/orders/:orderId/reconcile") @HttpCode(200)
  @UseGuards(AuthenticationGuard, AccountRequestGuard) @Header("Cache-Control", "no-store")
  reconcile(@Param("workspaceId") workspaceId: string, @Param("orderId") orderId: string, @Req() req: AuthenticatedRequest) {
    return this.billing.reconcile(workspaceId, req.currentUser!.id, orderId);
  }

  @Post("workspaces/:workspaceId/billing/orders/:orderId/cancel") @HttpCode(200)
  @UseGuards(AuthenticationGuard, AccountRequestGuard) @Header("Cache-Control", "no-store")
  cancel(@Param("workspaceId") workspaceId: string, @Param("orderId") orderId: string, @Req() req: AuthenticatedRequest) {
    return this.billing.cancel(workspaceId, req.currentUser!.id, orderId);
  }

  @Get("workspaces/:workspaceId/billing/availability")
  @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  availability(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest) {
    return this.billing.availability(workspaceId, req.currentUser!.id);
  }

  @Post("billing/payos/webhook") @HttpCode(200) @Header("Cache-Control", "no-store")
  webhook(@Body() body: unknown) { return this.billing.handleWebhook(body); }

  @Post("billing/lemon/webhook") @HttpCode(200) @Header("Cache-Control", "no-store")
  lemonWebhook(@Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    return this.billing.handleLemonWebhook(req.rawBody, req.get("X-Signature"), body);
  }
}
