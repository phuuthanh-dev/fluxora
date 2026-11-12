import type { NodeConfigurationField } from "./node-configuration-fields";

const target = (): NodeConfigurationField[] => [
  { kind: "credential", key: "credentialId", label: "Airtable connection", providers: ["AIRTABLE"] },
  { kind: "resource", key: "baseId", label: "Base", resource: "airtable-base", credentialKey: "credentialId", placeholder: "Search accessible bases" },
  { kind: "resource", key: "tableId", label: "Table", resource: "airtable-table", credentialKey: "credentialId", dependencyKey: "baseId", placeholder: "Search tables" },
];
const record = (): NodeConfigurationField => ({ kind: "resource", key: "recordId", label: "Record", resource: "airtable-record", credentialKey: "credentialId", dependencyKey: "baseId", secondaryDependencyKey: "tableId", placeholder: "Search records" });
export const airtableFields = {
  "action.airtable.list-records": (): NodeConfigurationField[] => [...target(), { kind: "number", key: "pageSize", label: "Records per page (1–100)", fallbackValue: 20 }, { kind: "text", key: "cursor", label: "Page cursor (optional)" }],
  "action.airtable.get-record": (): NodeConfigurationField[] => [...target(), record()],
  "action.airtable.create-record": (): NodeConfigurationField[] => [...target(), { kind: "airtable-fields", key: "fields", label: "Field values" }],
  "action.airtable.update-record": (): NodeConfigurationField[] => [...target(), record(), { kind: "airtable-fields", key: "fields", label: "Field values" }],
};
