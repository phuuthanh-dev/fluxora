import { z } from "zod";
import type { ConfigRules } from "./types";

export function isMongoDatabase(value: string): boolean {
  return value.length > 0 && value.length <= 63 && !/[\\/. "$\0]/.test(value);
}

export function isMongoCollection(value: string): boolean {
  return value.length > 0 && value.length <= 120 && !/[\0$]/.test(value) && !value.startsWith("system.");
}

/** Parse only a bounded JSON object. Never replace an unresolved value with an empty filter. */
export function parseMongoObject(input: unknown, maxBytes: number, filter: boolean): Record<string, unknown> | undefined {
  let value = input;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const encoded = JSON.stringify(value);
    if (!encoded || (filter ? encoded.length : new TextEncoder().encode(encoded).length) > maxBytes) return undefined;
    const inspect = (item: unknown, depth: number): boolean => {
      if ((filter && depth > 16) || item === undefined || (typeof item === "number" && !Number.isFinite(item))) return false;
      if (!item || typeof item !== "object") return true;
      if (Array.isArray(item)) {
        for (let index = 0; index < item.length; index++) if (!Object.hasOwn(item, index) || !inspect(item[index], depth + 1)) return false;
        return true;
      }
      return Object.entries(item).every(([key, child]) => !(filter && ["$where", "$function", "$accumulator"].includes(key)) && inspect(child, depth + 1));
    };
    return inspect(value, 0) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

const mongoResourceRules: ConfigRules = {
  database: { schema: z.string().refine(isMongoDatabase), message: "Choose a valid MongoDB database.", required: true },
  collection: { schema: z.string().refine(isMongoCollection), message: "Choose a valid MongoDB collection.", required: true },
};
export const mongoFind: ConfigRules = {
  ...mongoResourceRules,
  operation: { schema: z.literal("find"), message: "Choose the Find documents operation." },
  filter: { schema: z.unknown().refine((value) => parseMongoObject(value, 20_000, true) !== undefined), message: "Enter a valid MongoDB filter without server-side JavaScript." },
  limit: { schema: z.number().int().min(1).max(100), message: "Enter a document limit between 1 and 100." },
};
export const mongoInsert: ConfigRules = {
  ...mongoResourceRules,
  document: { schema: z.unknown().refine((value) => parseMongoObject(value, 200_000, false) !== undefined), message: "Enter a valid JSON document under 200 KB.", required: true },
};

