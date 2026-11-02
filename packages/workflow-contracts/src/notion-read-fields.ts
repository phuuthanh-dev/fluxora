import type { NodeConfigurationField } from "./node-configuration-fields";

export type NotionReadOperation = "page" | "children" | "property";

/** Inspector descriptors; the Notion adapter owns validation and redaction. */
export function notionReadConfigurationFields(operation: NotionReadOperation): NodeConfigurationField[] {
  const fields: NodeConfigurationField[] = [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: operation === "children" ? "blockId" : "pageId", label: operation === "children" ? "Page or block" : "Page", resource: "notion-page", credentialKey: "credentialId", placeholder: "Search shared pages" },
  ];
  if (operation === "property") fields.push({ kind: "text", key: "propertyId", label: "Property ID" });
  if (operation !== "page") fields.push(
    { kind: "number", key: "pageSize", label: "Maximum results (1–100)", fallbackValue: 20 },
    { kind: "text", key: "cursor", label: "Next cursor (optional)", advanced: { summary: "Advanced pagination", help: "Use nextCursor from the previous Notion output." } },
  );
  return fields;
}
