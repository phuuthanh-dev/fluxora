import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AccountRequestGuard } from "../auth/account-request.guard";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { BillingService } from "./billing.service";

@Controller()
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Post("workspaces/:workspaceId/billing/checkout")
  @UseGuards(AuthenticationGuard, AccountRequestGuard)
  @Header("Cache-Control", "no-store")
  checkout(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const plan = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).plan : undefined;
    return this.billing.createCheckout(workspaceId, req.currentUser!.id, plan);
  }

  @Get("workspaces/:workspaceId/billing/orders/:orderId")
  @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  status(@Param("workspaceId") workspaceId: string, @Param("orderId") orderId: string, @Req() req: AuthenticatedRequest) {
    return this.billing.status(workspaceId, req.currentUser!.id, orderId);
  }

  @Get("workspaces/:workspaceId/billing/availability")
  @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  availability(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest) {
    return this.billing.availability(workspaceId, req.currentUser!.id);
  }

  @Post("billing/payos/webhook") @HttpCode(200) @Header("Cache-Control", "no-store")
  webhook(@Body() body: unknown) { return this.billing.handleWebhook(body); }
}
