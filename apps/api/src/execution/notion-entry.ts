import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { notionRequest } from "./notion-operations";
import { notionToken, writePage } from "./notion-create-page";
import { fetchSafeOutbound, fetchSafeOutboundWrite } from "./outbound-url-policy";
import { NodeFailure } from "./node-failure";
import { uncertainDelivery } from "./provider-request-policy";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const version = "2025-09-03";
const types = ["title", "rich_text", "number", "status", "select", "date", "checkbox"] as const;
type PropertyType = typeof types[number];
type Property = { id: string; name: string; type: PropertyType; options?: Array<{ id: string; name: string }> };
type Row = { id: string; type: PropertyType; value: string | number | boolean | null };
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const sameId = (a: string, b: string) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
const invalid = () => new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid data source schema.", false);

/** Allowlisted schema metadata only; no page data or file URLs enter the form. */
export async function notionWritableProperties(token: string, dataSourceId: string, read: Transport = fetchSafeOutbound) {
  if (nodeConfigIssues("action.notion.query-data-source", { dataSourceId }, "resolved").length) throw new NodeFailure("INVALID_INPUT", "Choose a valid Notion data source.", false);
  const source = record(await notionRequest(`data_sources/${dataSourceId}`, token, read, { version }));
  if (!source || source.object !== "data_source" || typeof source.id !== "string" || !sameId(source.id, dataSourceId) || !record(source.properties)) throw invalid();
  const properties: Property[] = [];
  for (const [name, raw] of Object.entries(record(source.properties)!)) {
    const property = record(raw);
    if (!property || !types.includes(property.type as PropertyType)) continue;
    if (typeof property.id !== "string" || !property.id || property.id.length > 256 || property.id.includes(token)) throw invalid();
    try { decodeURIComponent(property.id); } catch { throw invalid(); }
    const type = property.type as PropertyType;
    const choices = record(property[type])?.options;
    let options: Property["options"];
    if (type === "select" || type === "status") {
      if (!Array.isArray(choices) || choices.length > 100) throw invalid();
      options = choices.map((value) => {
        const choice = record(value);
        if (!choice || typeof choice.id !== "string" || typeof choice.name !== "string" || choice.id.includes(token) || choice.name.includes(token)) throw invalid();
        return { id: choice.id, name: choice.name.slice(0, 200) };
      });
    }
    properties.push({ id: property.id, name: name.split(token).join("[REDACTED]").slice(0, 200), type, ...(options ? { options } : {}) });
  }
  return { properties: properties.slice(0, 100), hasMore: properties.length > 100 };
}

export function notionPropertyBody(rows: Row[], schema: Property[], create: boolean): Record<string, unknown> {
  const output: Record<string, unknown> = Object.create(null);
  const requiredTitle = schema.find((field) => field.type === "title");
  if (create && (!requiredTitle || !rows.some((row) => decodeURIComponent(row.id) === decodeURIComponent(requiredTitle.id) && row.type === "title"))) throw new NodeFailure("INVALID_INPUT", "Add the data source's title property before creating a page.", false);
  for (const row of rows) {
    const field = schema.find((candidate) => decodeURIComponent(candidate.id) === decodeURIComponent(row.id));
    if (!field || field.type !== row.type) throw new NodeFailure("INVALID_INPUT", "A property changed or is not writable. Reload the data source properties.", false);
    if (row.type === "title" || row.type === "rich_text") output[field.id] = { [row.type]: row.value === null || row.value === "" ? [] : [{ type: "text", text: { content: row.value } }] };
    else if (row.type === "select" || row.type === "status") {
      if (row.value === null) output[field.id] = { [row.type]: null };
      else {
        const option = field.options?.find((choice) => choice.id === row.value);
        if (!option) throw new NodeFailure("INVALID_INPUT", "Choose an existing Notion option. Reload properties if it changed.", false);
        output[field.id] = { [row.type]: { id: option.id } };
      }
    } else if (row.type === "date") output[field.id] = { date: row.value === null ? null : { start: row.value } };
    else output[field.id] = { [row.type]: row.value };
  }
  return output;
}

export async function executeNotionEntry(config: Record<string, unknown>, operation: "create" | "update", mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound, write: Transport = fetchSafeOutboundWrite) {
  const issue = nodeConfigIssues(`action.notion.${operation}-entry`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const dataSourceId = config.dataSourceId as string;
  const rows = config.properties as Row[];
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: { pageId: operation === "update" ? config.pageId : "00000000-0000-4000-8000-000000000001", dataSourceId, simulated: true } };
  const token = await notionToken(config, workspaceId, credentials, dataSourceId);
  const schema = await notionWritableProperties(token, dataSourceId, read);
  const properties = notionPropertyBody(rows, schema.properties, operation === "create");
  if (operation === "update") {
    const page = record(await notionRequest(`pages/${config.pageId}`, token, read, { version }));
    const parent = record(page?.parent);
    if (page?.object !== "page" || typeof page.id !== "string" || !sameId(page.id, config.pageId as string) || parent?.type !== "data_source_id" || typeof parent.data_source_id !== "string" || !sameId(parent.data_source_id, dataSourceId)) throw new NodeFailure("INVALID_INPUT", "Select a page belonging to this data source.", false);
  }
  const pageId = await writePage(`https://api.notion.com/v1/pages${operation === "update" ? `/${config.pageId}` : ""}`, operation === "update" ? "PATCH" : "POST", { properties, ...(operation === "create" ? { parent: { type: "data_source_id", data_source_id: dataSourceId } } : {}) }, token, write, version);
  if (operation === "update" && !sameId(pageId, config.pageId as string)) throw uncertainDelivery("Notion");
  return { status: "succeeded" as const, route: "success" as const, output: { pageId, dataSourceId } };
}
