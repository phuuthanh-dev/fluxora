import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PayOS, type Webhook } from "@payos/node";
import { planCatalog } from "@workflow/contracts";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";

type PaidPlan = "STARTER" | "PRO";

/** Hosted checkout is disabled until plan entitlements and real-money qualification are complete. */
@Injectable()
export class BillingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService) {}

  protected client() {
    const { PAYOS_CLIENT_ID: clientId, PAYOS_API_KEY: apiKey, PAYOS_CHECKSUM_KEY: checksumKey } = process.env;
    if (!clientId || !apiKey || !checksumKey) throw new ServiceUnavailableException("Payment provider is not configured.");
    return new PayOS({ clientId, apiKey, checksumKey, maxRetries: 0, timeout: 15000, logger: null });
  }

  async status(workspaceId: string, userId: string, orderId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const order = await this.prisma.paymentOrder.findFirst({ where: { id: orderId, workspaceId }, select: { id: true, plan: true, amount: true, status: true, paidAt: true } });
    if (!order) throw new NotFoundException("Payment order was not found.");
    return order;
  }

  async availability(workspaceId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    return { available: process.env.PAYOS_CHECKOUT_ENABLED === "true" && Boolean(process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY) };
  }

  async createCheckout(workspaceId: string, userId: string, plan: unknown) {
    await this.workspaces.requireOwner(workspaceId, userId);
    if (plan !== "STARTER" && plan !== "PRO") throw new BadRequestException("Choose a valid plan.");
    // Never open real checkout until both business entitlements and reconciliation are released.
    if (process.env.PAYOS_CHECKOUT_ENABLED !== "true") throw new ServiceUnavailableException("Paid plans are not available yet.");
    const payos = this.client();
    const origin = process.env.WEB_ORIGIN;
    if (!origin || (process.env.NODE_ENV === "production" && new URL(origin).protocol !== "https:")) throw new ServiceUnavailableException("Payment provider is not configured.");
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { paidPlan: true, paidUntil: true } });
      if (workspace.paidUntil && workspace.paidUntil > new Date() && workspace.paidPlan !== plan) throw new ConflictException("Wait until the current paid plan ends before choosing another plan.");
      const current = await tx.paymentOrder.findFirst({ where: { workspaceId, status: { in: ["CREATING", "PENDING", "REVIEW"] } }, orderBy: { createdAt: "desc" } });
      if (current) return current;
      return tx.paymentOrder.create({ data: { workspaceId, plan, amount: planCatalog[plan].priceVnd } });
    });
    if (order.plan !== plan) throw new ConflictException("Resolve the existing payment before choosing another plan.");
    if (order.status === "PENDING" && order.checkoutUrl) return { checkoutUrl: order.checkoutUrl, orderId: order.id };
    if (order.status !== "CREATING") throw new ConflictException("Payment needs reconciliation before another checkout can be created.");
    // Claim dispatch atomically: a lost provider response must not create another payment link.
    const claimed = await this.prisma.paymentOrder.updateMany({ where: { id: order.id, status: "CREATING" }, data: { status: "REVIEW" } });
    if (!claimed.count) throw new ConflictException("Payment is being prepared. Please check again shortly.");
    try {
      const code = Number(order.orderCode);
      if (!Number.isSafeInteger(code)) throw new Error("Payment order code is outside safe range.");
      const workspace = encodeURIComponent(workspaceId);
      const response = await payos.paymentRequests.create({ orderCode: code, amount: order.amount, description: `Fluxora ${plan}`, returnUrl: `${origin}/dashboard/plan?workspace=${workspace}&payment=return`, cancelUrl: `${origin}/dashboard/plan?workspace=${workspace}&payment=cancel` });
      const checkout = new URL(response.checkoutUrl);
      if (response.orderCode !== code || response.amount !== order.amount || response.currency !== "VND" || checkout.protocol !== "https:" || checkout.hostname !== "pay.payos.vn") throw new Error("Payment provider returned an invalid checkout.");
      await this.prisma.paymentOrder.updateMany({ where: { id: order.id, status: "REVIEW" }, data: { status: "PENDING", paymentLinkId: response.paymentLinkId, checkoutUrl: response.checkoutUrl } });
      return { checkoutUrl: response.checkoutUrl, orderId: order.id };
    } catch {
      // REVIEW is intentional: provider may have created the link despite the timeout.
      throw new ServiceUnavailableException("Payment could not be prepared. Please contact support before retrying.");
    }
  }

  async handleWebhook(payload: unknown) {
    const payos = this.client();
    let data: Awaited<ReturnType<typeof payos.webhooks.verify>>;
    try { data = await payos.webhooks.verify(payload as Webhook); }
    catch { throw new BadRequestException("Invalid payment notification."); }
    if (!Number.isSafeInteger(data.orderCode) || data.orderCode <= 0 || data.code !== "00" || data.currency !== "VND") throw new BadRequestException("Invalid payment notification.");
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderCode: BigInt(data.orderCode) } });
    if (!order || data.amount <= 0 || data.amount > order.amount || (order.paymentLinkId && order.paymentLinkId !== data.paymentLinkId)) throw new BadRequestException("Payment does not match an order.");
    let remote: Awaited<ReturnType<typeof payos.paymentRequests.get>>;
    try { remote = await payos.paymentRequests.get(data.orderCode); }
    catch { throw new ServiceUnavailableException("Payment confirmation is temporarily unavailable."); }
    if (remote.id !== data.paymentLinkId || remote.orderCode !== data.orderCode || remote.amount !== order.amount || remote.amountPaid !== order.amount || remote.amountRemaining !== 0 || remote.status !== "PAID") throw new BadRequestException("Payment is not fully confirmed.");
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${order.workspaceId} FOR UPDATE`;
      const fresh = await tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      if (fresh.status === "PAID") return;
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: order.workspaceId }, select: { paidPlan: true, paidUntil: true } });
      const now = new Date();
      // A conflicting purchase requires human reconciliation, never overwrite paid access.
      if (workspace.paidUntil && workspace.paidUntil > now && workspace.paidPlan !== fresh.plan) {
        await tx.paymentOrder.update({ where: { id: fresh.id }, data: { status: "REVIEW", paymentLinkId: data.paymentLinkId } });
        return;
      }
      const start = workspace.paidUntil && workspace.paidUntil > now ? workspace.paidUntil : now;
      const paidUntil = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      await tx.workspace.update({ where: { id: order.workspaceId }, data: { paidPlan: fresh.plan as PaidPlan, paidUntil } });
      await tx.paymentOrder.update({ where: { id: fresh.id }, data: { status: "PAID", paymentLinkId: data.paymentLinkId, paidAt: now, checkoutUrl: null } });
    });
    return { received: true };
  }
}
