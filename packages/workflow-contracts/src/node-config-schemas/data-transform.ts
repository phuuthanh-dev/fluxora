import { z } from "zod";
import type { ConfigRules } from "./types";

export const dataPath = z.string().min(1).max(256).refine((path) => path.split(".").every((part) => /^[A-Za-z0-9_ -]+$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part)));
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/).refine((value) => !["__proto__", "prototype", "constructor"].includes(value));
const pathRule = { schema: dataPath, required: true, message: "Choose a field path, such as customer.id." };
export const aggregate: ConfigRules = {
  outputField: { schema: name, required: true, message: "Enter a simple output field name." },
};
export const splitOut: ConfigRules = {
  field: pathRule,
  destination: { schema: z.union([name, z.literal("")]), message: "Enter a simple destination field name or leave it empty." },
  include: { schema: z.enum(["none", "all"]), message: "Choose which other fields to keep." },
};
export const sortItems: ConfigRules = {
  field: pathRule,
  direction: { schema: z.enum(["asc", "desc"]), message: "Choose ascending or descending order." },
  valueType: { schema: z.enum(["text", "number", "date"]), message: "Choose text, number or date." },
};
export const limitItems: ConfigRules = {
  maxItems: { schema: z.number().int().min(0).max(100), required: true, message: "Choose between 0 and 100 items." },
  keep: { schema: z.enum(["first", "last"]), message: "Choose the first or last items." },
};
export const merge: ConfigRules = {
  mode: { schema: z.enum(["append", "matching"]), message: "Choose Append or Matching fields." },
  field1: { ...pathRule, when: (config) => config.mode === "matching", dependsOn: ["mode"] },
  field2: { ...pathRule, when: (config) => config.mode === "matching", dependsOn: ["mode"] },
  outputType: { schema: z.enum(["matches", "enrich-input1"]), message: "Choose matches only or enrich Input 1." },
};
