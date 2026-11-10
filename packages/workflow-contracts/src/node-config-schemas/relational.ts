import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

const identifier = (label: string): FieldRule => ({ schema: z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/), required: true, message: `Choose a valid ${label}.` });
const table = identifier("table");
const limit = { schema: z.number().int().min(1).max(100), message: "Choose a row limit between 1 and 100." };
const columnList = z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/)).max(50);
const columns = { schema: columnList.refine((value) => new Set(value).size === value.length), message: "Choose at most 50 distinct valid columns." };
export const postgresSelect: ConfigRules = {
  schema: identifier("database schema"), table, limit, columns,
  conditions: { schema: z.array(z.unknown()).max(20), message: "Choose at most 20 filter conditions." },
  orderBy: { schema: z.union([z.literal(""), z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/)]), message: "Choose a valid ordering column." },
  orderDirection: { schema: z.enum(["", "asc", "desc"]), dependsOn: ["orderBy"], matches: (value, config) => value === "" || !!config.orderBy, message: "Choose an ordering column before setting direction." },
  offset: { schema: z.number().int().min(0).max(100_000), dependsOn: ["orderBy"], matches: (value, config) => value === 0 || !!config.orderBy, message: "Choose an ordering column and an offset between 0 and 100,000." },
};
export const supabaseSelect: ConfigRules = {
  table, limit, columns: { schema: columnList, message: "Choose at most 50 valid columns." },
  filters: { schema: z.array(z.unknown()).max(20), message: "Choose at most 20 filters." },
  order: { schema: z.array(z.unknown()).max(10), message: "Choose at most 10 ordering columns." },
  offset: { schema: z.number().int().min(0).max(1_000_000), dependsOn: ["order"], matches: (value, config) => value === 0 || (Array.isArray(config.order) && config.order.length > 0), message: "Choose an ordering before using an offset." },
  rejectUnsafeNumbers: { schema: z.boolean(), message: "Choose whether to reject numbers that lose precision." },
};
export const supabaseInsert: ConfigRules = {
  table,
  fields: { schema: z.array(z.unknown()).min(1).max(50), required: true, message: "Enter between 1 and 50 column values." },
  timeoutMs: { schema: z.number().int().min(1000).max(120_000), message: "Supabase timeout must be between 1,000 and 120,000 milliseconds." },
};

export const postgresInsert: ConfigRules = {
  schema: identifier("database schema"), table,
  fields: { schema: z.array(z.unknown()).min(1).max(50), required: true, message: "Enter between 1 and 50 column values." },
};
export const postgresUpsert: ConfigRules = { ...postgresInsert, conflictColumn: identifier("conflict column") };
