import type { NodeConfigurationField } from "./node-configuration-fields";

export const dataTransformFields = {
  "action.aggregate": (): NodeConfigurationField[] => [
    { kind: "text", key: "outputField", label: "Put all items in field" },
  ],
  "action.split-out": (): NodeConfigurationField[] => [
    { kind: "data-path", key: "field", label: "Array field to split" },
    { kind: "text", key: "destination", label: "Destination field (optional)" },
    { kind: "select", key: "include", label: "Keep other fields", options: [{ value: "none", label: "No other fields" }, { value: "all", label: "All other fields" }] },
  ],
  "action.sort": (): NodeConfigurationField[] => [
    { kind: "data-path", key: "field", label: "Field to sort by" },
    { kind: "select", key: "valueType", label: "Compare as", options: [{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }] },
    { kind: "select", key: "direction", label: "Order", options: [{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }] },
  ],
  "action.limit": (): NodeConfigurationField[] => [
    { kind: "number", key: "maxItems", label: "Maximum items (0–100)", fallbackValue: 10 },
    { kind: "select", key: "keep", label: "Keep", options: [{ value: "first", label: "First items" }, { value: "last", label: "Last items" }] },
  ],
  "action.merge": (): NodeConfigurationField[] => [
    { kind: "select", key: "mode", label: "Mode", fallbackValue: "append", options: [{ value: "append", label: "Append" }, { value: "matching", label: "Matching fields" }] },
    { kind: "data-path", input: "input1", key: "field1", label: "Input 1 matching field", visibleWhen: { key: "mode", equals: "matching" } },
    { kind: "data-path", input: "input2", key: "field2", label: "Input 2 matching field", visibleWhen: { key: "mode", equals: "matching" } },
    { kind: "select", key: "outputType", label: "Output", fallbackValue: "matches", options: [{ value: "matches", label: "Keep matches" }, { value: "enrich-input1", label: "Enrich Input 1" }], visibleWhen: { key: "mode", equals: "matching" } },
  ],
};
