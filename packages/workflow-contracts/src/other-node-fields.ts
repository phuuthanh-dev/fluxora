import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";

/** Inspector descriptors only; backend validation remains authoritative. */
export const otherNodeFields = {
  "action.http-request": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "HTTP credential (optional)", providers: ["HTTP"], optional: true },
      { kind: "select", key: "method", label: "Method", options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
        { value: "DELETE", label: "DELETE" },
      ] },
      { kind: "text", key: "url", label: "URL" },
      { kind: "key-value", key: "headers", label: "Headers (optional)", keyPlaceholder: "Header name", valuePlaceholder: "Header value" },
      { kind: "textarea", key: "body", label: "Request body" },
      { kind: "number", key: "timeoutMs", label: "Timeout (ms)", fallbackValue: 15_000 },
    ],
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;
