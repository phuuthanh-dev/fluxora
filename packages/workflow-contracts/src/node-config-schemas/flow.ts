import { z } from "zod";
import type { ConfigRules } from "./types";

export const editFields: ConfigRules = {
  fields: { required: true, message: "Add up to 30 uniquely named fields with a valid value and type.", schema: z.array(z.object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/).refine((name) => !["__proto__", "constructor", "prototype"].includes(name)),
    type: z.enum(["text", "number", "boolean"]),
    value: z.union([z.string(), z.number().finite(), z.boolean()]),
  }).strict()).min(1).max(30).refine((fields) => new Set(fields.map((field) => field.name)).size === fields.length).refine((fields) => fields.every((field) => field.type === "text" ? typeof field.value === "string" : field.type === "number" ? typeof field.value === "number" || typeof field.value === "string" && field.value.trim() !== "" && Number.isFinite(Number(field.value)) : typeof field.value === "boolean" || field.value === "true" || field.value === "false")) },
};

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
