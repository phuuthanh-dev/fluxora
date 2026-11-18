import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { verifyShopifySignature } from "../webhooks/shopify-trigger-protocol";
import { CredentialVaultService } from "./credential-vault.service";
import { shopifyShop } from "./shopify-domain";
import { graphCredentialIds } from "./credential-references";

const kinds = new Set(["customer-data", "customer-redact", "shop-redact"]);
@Injectable()
export class ShopifyPrivacyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialVaultService) private readonly vault: CredentialVaultService) {}

  async receive(kind: string, raw: Buffer | undefined, signature?: string, deliveryId?: string) {
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!kinds.has(kind) || !raw || raw.length > 1_000_000 || !secret || !verifyShopifySignature(raw, signature, secret, 1_000_000)) throw new BadRequestException({ code: "SHOPIFY_PRIVACY_INVALID", message: "Invalid Shopify notification." });
    let body: unknown;
    try { body = JSON.parse(raw.toString("utf8")); } catch { throw new BadRequestException({ code: "SHOPIFY_PRIVACY_INVALID", message: "Invalid Shopify notification." }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "SHOPIFY_PRIVACY_INVALID", message: "Invalid Shopify notification." });
    const record = body as Record<string, unknown>, shop = shopifyShop(record.shop_domain);
    const shopId = typeof record.shop_id === "number" && Number.isFinite(record.shop_id) && record.shop_id > 0 || typeof record.shop_id === "string" && /^[1-9][0-9]{0,29}$/.test(record.shop_id);
    const customer = record.customer && typeof record.customer === "object" && !Array.isArray(record.customer);
    const valid = kind === "customer-data" ? customer && (record.orders_requested == null || Array.isArray(record.orders_requested)) && (record.data_request == null || typeof record.data_request === "object" && !Array.isArray(record.data_request))
      : kind === "customer-redact" ? customer && Array.isArray(record.orders_to_redact)
        : !("customer" in record) && !("orders_requested" in record) && !("orders_to_redact" in record);
    if (!shop || !shopId || !valid || !deliveryId || !/^[a-zA-Z0-9:_-]{1,200}$/.test(deliveryId)) throw new BadRequestException({ code: "SHOPIFY_PRIVACY_INVALID", message: "Invalid Shopify notification." });
    const key = process.env.APP_ENCRYPTION_KEY;
    if (!key || Buffer.from(key, "base64").length !== 32) throw new Error("Encryption key required");
    // Shopify keeps the delivery ID stable across retries; identical payloads can
    // also represent a later, separate privacy request and must not be lost.
    const id = createHmac("sha256", Buffer.from(key, "base64")).update(`shopify-privacy:${kind}\0${shop}\0${deliveryId}`).digest("hex");
    await this.prisma.shopifyPrivacyRequest.upsert({ where: { id }, create: { id, shop, kind, encryptedPayload: this.vault.encrypt({ raw: raw.toString("utf8") }) }, update: {} });
    return { acknowledged: true };
  }

  async list() {
    return this.prisma.shopifyPrivacyRequest.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, kind: true, shop: true, createdAt: true } });
  }

  async detail(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new NotFoundException({ code: "SHOPIFY_PRIVACY_NOT_FOUND", message: "Request not found." });
    const request = await this.prisma.shopifyPrivacyRequest.findUnique({ where: { id } });
    if (!request || request.resolvedAt || !request.encryptedPayload) throw new NotFoundException({ code: "SHOPIFY_PRIVACY_NOT_FOUND", message: "Request not found." });
    const payload = this.vault.decrypt(request.encryptedPayload).raw;
    if (typeof payload !== "string") throw new Error("Invalid Shopify privacy record");
    const installation = await this.prisma.shopifyInstallation.findUnique({ where: { shop: request.shop }, select: { credentialIds: true, workspaceIds: true } });
    const candidates = installation?.workspaceIds.length ? await this.prisma.workflow.findMany({ where: { workspaceId: { in: installation.workspaceIds } }, take: 201, orderBy: { id: "asc" }, select: { id: true, name: true, isActive: true, versions: { select: { graph: true } } } }) : [];
    const workflows = candidates.slice(0, 200).filter((workflow) => workflow.versions.some((version) => graphCredentialIds(version.graph).some((id) => installation?.credentialIds.includes(id)))).map(({ id: workflowId, name, isActive }) => ({ id: workflowId, name, isActive }));
    return { id: request.id, shop: request.shop, kind: request.kind, createdAt: request.createdAt, payload, workflows, inventoryIncomplete: !installation || candidates.length > 200 };
  }

  async resolve(id: string, actorId: string, reviewed: unknown) {
    if (!/^[a-f0-9]{64}$/.test(id) || reviewed !== true) throw new BadRequestException({ code: "INVALID_INPUT", message: "Review and complete the request first." });
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.shopifyPrivacyRequest.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date(), encryptedPayload: null } });
      if (!result.count) throw new ConflictException({ code: "SHOPIFY_PRIVACY_CHANGED", message: "The request was already resolved." });
      await tx.auditLog.create({ data: { actorId, action: "admin.shopify_privacy_resolved", targetType: "shopify_privacy", targetId: id } });
      return { resolved: true };
    });
  }
}
