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
