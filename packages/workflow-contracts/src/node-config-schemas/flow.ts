import { z } from "zod";
import type { ConfigRules } from "./types";

export const ifCondition: ConfigRules = { operator: { schema: z.union([z.enum(["equals", "not_equals", "contains", "exists"]), z.literal(""), z.null()]), message: "Choose a supported If operator." } };
export const switchCondition: ConfigRules = {
  cases: { schema: z.array(z.unknown()).refine((items) => {
    const values = items.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).value === "string" && ((item as Record<string, string>).value ?? "").trim() ? [(item as Record<string, string>).value!.trim()] : []);
    return values.length > 0 && new Set(values).size === values.length;
  }), required: true, message: "Add at least one distinct, non-empty switch case." },
};
export const approval: ConfigRules = {
  notificationProvider: { schema: z.union([z.enum(["google_chat", "http_webhook"]), z.literal(""), z.null()]), message: "Choose a supported approval notification provider." },
  notificationCredentialId: { schema: z.string(), message: "Choose a valid notification connection." },
};
