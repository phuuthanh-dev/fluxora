import { z } from "zod";
import type { ConfigRules } from "./types";

export const shopifyListOrders: ConfigRules = {
  limit: { schema: z.number().int().min(1).max(50), message: "Choose between 1 and 50 orders." },
  orderName: { schema: z.string().regex(/^(?:#?[A-Za-z0-9_-]{1,80})?$/), message: "Enter a valid order number." },
  cursor: { schema: z.string().max(1024).refine((value) => !/[\s\u0000-\u001f\u007f]/.test(value)), message: "Enter a valid cursor." },
};

export const shopifyGetOrder: ConfigRules = {
  resourceId: { schema: z.string().regex(/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,29}$/), required: true, message: "Choose a valid Shopify order." },
};
export const shopifyGetProduct: ConfigRules = {
  resourceId: { schema: z.string().regex(/^gid:\/\/shopify\/Product\/[1-9][0-9]{0,29}$/), required: true, message: "Choose a valid Shopify product." },
};
export const shopifyListProducts: ConfigRules = {
  limit: { schema: z.number().int().min(1).max(50), message: "Choose between 1 and 50 products." },
  cursor: { schema: z.string().max(1024).refine((value) => !/[\s\u0000-\u001f\u007f]/.test(value)), message: "Enter a valid cursor." },
};

const productTitle = { schema: z.string().trim().min(1).max(256), required: true, message: "Enter a title up to 256 characters." };
const productStatus = { schema: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]), required: true, message: "Choose a valid product status." };
export const shopifyCreateProduct: ConfigRules = { title: productTitle, status: productStatus };
export const shopifyUpdateProduct: ConfigRules = {
  ...shopifyGetProduct,
  field: { schema: z.enum(["title", "status"]), required: true, message: "Choose a valid field." },
  title: { ...productTitle, when: (config) => config.field === "title", dependsOn: ["field"] },
  status: { ...productStatus, when: (config) => config.field === "status", dependsOn: ["field"] },
};
export const shopifyCreateOrder: ConfigRules = {
  variantId: { schema: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]{0,29}$/), required: true, message: "Choose a valid Shopify product variant." },
  quantity: { schema: z.number().int().min(1).max(100), required: true, message: "Choose a quantity between 1 and 100." },
};
export const shopifyUpdateOrder: ConfigRules = {
  ...shopifyGetOrder,
  note: { schema: z.string().max(5000), required: true, message: "Enter a note up to 5,000 characters." },
};
