import { z } from "zod";
import type { ConfigRules } from "./types";

export const shopifyListOrders: ConfigRules = {
  limit: { schema: z.number().int().min(1).max(50), message: "Choose between 1 and 50 orders." },
  orderName: { schema: z.string().regex(/^(?:#?[A-Za-z0-9_-]{1,80})?$/), message: "Enter a valid order number." },
  cursor: { schema: z.string().max(1024).refine((value) => !/[\s\u0000-\u001f\u007f]/.test(value)), message: "Enter a valid cursor." },
};
