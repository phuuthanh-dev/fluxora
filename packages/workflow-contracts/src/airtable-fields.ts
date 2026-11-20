import type { NodeConfigurationField } from "./node-configuration-fields";

const target = (): NodeConfigurationField[] => [
  { kind: "credential", key: "credentialId", label: "Airtable connection", providers: ["AIRTABLE"] },
  { kind: "resource", key: "baseId", label: "Base", resource: "airtable-base", credentialKey: "credentialId", placeholder: "Search accessible bases" },
  { kind: "resource", key: "tableId", label: "Table", resource: "airtable-table", credentialKey: "credentialId", dependencyKey: "baseId", placeholder: "Search tables" },
];
const record = (): NodeConfigurationField => ({ kind: "resource", key: "recordId", label: "Record", resource: "airtable-record", credentialKey: "credentialId", dependencyKey: "baseId", secondaryDependencyKey: "tableId", placeholder: "Search records" });
export const airtableFields = {
  "trigger.airtable.record": (): NodeConfigurationField[] => [...target(),
    { kind: "resource", key: "fieldId", label: "Trigger field", resource: "airtable-trigger-field", credentialKey: "credentialId", dependencyKey: "baseId", secondaryDependencyKey: "tableId", placeholder: "Trigger field" },
    { kind: "select", key: "pollMinutes", label: "Check every", options: [{ value: "1", label: "Every minute" }, { value: "5", label: "Every 5 minutes" }, { value: "15", label: "Every 15 minutes" }, { value: "60", label: "Every hour" }, { value: "180", label: "Every 3 hours" }, { value: "360", label: "Every 6 hours" }, { value: "1440", label: "Every day" }] },
  ],
  "action.airtable.list-records": (): NodeConfigurationField[] => [...target(), { kind: "number", key: "pageSize", label: "Records per page (1–100)", fallbackValue: 20 }, { kind: "text", key: "cursor", label: "Page cursor (optional)" }],
  "action.airtable.get-record": (): NodeConfigurationField[] => [...target(), record()],
  "action.airtable.create-record": (): NodeConfigurationField[] => [...target(), { kind: "airtable-fields", key: "fields", label: "Field values" }],
  "action.airtable.update-record": (): NodeConfigurationField[] => [...target(), record(), { kind: "airtable-fields", key: "fields", label: "Field values" }],
};
