import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

export function validNotionCursor(value: string): boolean {
  if (!value || value.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}
const notionId = (label: string, trim = false): FieldRule => ({ schema: z.string().refine((value) => /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(trim ? value.trim() : value)), required: true, message: `Choose a valid Notion ${label}.` });
const property = z.string().refine((value) => {
  if (!value || value.length > 256) return false;
  try { const decoded = decodeURIComponent(value); return !!decoded && decoded.length <= 256 && decoded !== "." && decoded !== ".." && !/[\/\u0000-\u001f\u007f-\u009f]/.test(decoded); } catch { return false; }
});
const pagination: ConfigRules = {
  pageSize: { schema: z.number().int().min(1).max(100), message: "Choose a page size between 1 and 100." },
  cursor: { schema: z.string().refine((value) => value === "" || validNotionCursor(value)), message: "Enter a valid Notion pagination cursor." },
};
const title: FieldRule = { schema: z.string().refine((value) => !!value.trim() && value.trim().length <= 2000), required: true, message: "Enter a title of at most 2,000 characters." };
export const notionSearch: ConfigRules = {
  ...pagination,
  query: { schema: z.string().max(200), message: "Enter a search term of at most 200 characters." },
  collectPages: { schema: z.boolean(), message: "Choose whether to collect additional results." },
};
export const notionPage: ConfigRules = { pageId: notionId("page") };
export const notionChildren: ConfigRules = { blockId: notionId("page or block"), ...pagination };
export const notionProperty: ConfigRules = { pageId: notionId("page"), propertyId: { schema: property, required: true, message: "Choose a valid Notion property." }, ...pagination };
export const notionCreate: ConfigRules = { parentPageId: notionId("parent page", true), title, content: { schema: z.string().max(2000), message: "Enter text of at most 2,000 characters." } };
export const notionUpdate: ConfigRules = { pageId: notionId("page", true), title };
export const notionQuery: ConfigRules = {
  dataSourceId: notionId("data source"), ...pagination,
  sort: { schema: z.enum(["provider", "created-newest", "created-oldest", "edited-newest", "edited-oldest"]), message: "Choose a valid sort order." },
  editedAfter: { schema: z.string().refine((value) => value === "" || (/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i.test(value) && Number.isFinite(Date.parse(value)))), message: "Enter a valid date with a timezone." },
  filterMode: { schema: z.enum(["none", "status", "select", "checkbox"]), message: "Choose a supported property filter." },
  filterProperty: { schema: property, required: true, when: (config) => !!config.filterMode && config.filterMode !== "none", dependsOn: ["filterMode"], message: "Choose a valid filter property." },
  filterValue: { schema: z.string().min(1).max(200), required: true, when: (config) => !!config.filterMode && config.filterMode !== "none", dependsOn: ["filterMode"], matches: (value, config) => config.filterMode !== "checkbox" || value === "true" || value === "false", message: "Choose a valid filter value." },
};

const writeProperty = z.object({
  id: property,
  type: z.enum(["title", "rich_text", "number", "status", "select", "date", "checkbox"]),
  value: z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
}).strict().refine((row) => {
  if (row.value === null) return row.type !== "title" && row.type !== "checkbox";
  if (row.type === "checkbox") return typeof row.value === "boolean";
  if (row.type === "number") return typeof row.value === "number";
  if (typeof row.value !== "string") return false;
  if (row.type === "date") return /^(?:\d{4}-\d\d-\d\d|\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d))$/.test(row.value) && Number.isFinite(Date.parse(row.value));
  return !["title", "status", "select"].includes(row.type) || !!row.value.trim();
});
const writeProperties: FieldRule = { schema: z.array(writeProperty).min(1).max(50).refine((rows) => { try { return new Set(rows.map((row) => decodeURIComponent(row.id))).size === rows.length; } catch { return false; } }), required: true, message: "Add distinct writable properties with values matching their types." };
export const notionCreateEntry: ConfigRules = { dataSourceId: notionId("data source"), properties: writeProperties };
export const notionUpdateEntry: ConfigRules = { ...notionCreateEntry, pageId: notionId("page") };
