import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

const maxBytes = 256 * 1024;
const invalid = () => new BadRequestException({ code: "SHOPIFY_WEBHOOK_INVALID", message: "Shopify webhook data is invalid." });

export function verifyShopifySignature(raw: unknown, signature: unknown, secret: unknown, maximumBytes = maxBytes) {
  if (!Buffer.isBuffer(raw) || raw.length > maximumBytes || typeof signature !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(signature) || typeof secret !== "string" || !secret || Buffer.byteLength(secret) > 1024) return false;
  const received = Buffer.from(signature, "base64");
  if (received.length !== 32 || received.toString("base64") !== signature) return false;
  return timingSafeEqual(received, createHmac("sha256", secret).update(raw).digest());
}

/** Never put the provider's full payload or customer fields into execution history. */
export function normalizeShopifyOrder(raw: Buffer, secret: string) {
  if (!Buffer.isBuffer(raw) || raw.length > maxBytes) throw invalid();
  let value: unknown;
  try { value = JSON.parse(raw.toString("utf8")); } catch { throw invalid(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.admin_graphql_api_id !== "string" || !/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,29}$/.test(row.admin_graphql_api_id) || typeof row.name !== "string" || row.name.length < 1 || row.name.length > 256 || /[\x00-\x1f\x7f]/.test(row.name) || typeof row.created_at !== "string" || row.created_at.length > 64 || !Number.isFinite(Date.parse(row.created_at))) throw invalid();
  const payload = { source: "shopify", event: "orders/create", orderId: row.admin_graphql_api_id, orderName: row.name, createdAt: row.created_at };
  if (JSON.stringify(payload).includes(secret)) throw invalid();
  return { payload, orderId: row.admin_graphql_api_id.slice("gid://shopify/Order/".length) };
}
