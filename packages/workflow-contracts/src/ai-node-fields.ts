import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";

/** Inspector descriptors only; backend validation remains authoritative. */
export const aiNodeFields = {
  "action.openai": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "OpenAI credential", providers: ["OPENAI"] },
      { kind: "resource", key: "model", label: "Model", resource: "openai-model", credentialKey: "credentialId", placeholder: "Search OpenAI models" },
      { kind: "textarea", key: "prompt", label: "Prompt" },
      { kind: "structured-output", key: "outputSchema", label: "Structured output" },
      { kind: "number", key: "maxOutputTokens", label: "Max output tokens", fallbackValue: 1024 },
      { kind: "number", key: "timeoutMs", label: "Timeout (ms)", fallbackValue: 30000 },
    ],
  "action.gemini": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Gemini credential", providers: ["GEMINI"] },
      { kind: "resource", key: "model", label: "Model", resource: "gemini-model", credentialKey: "credentialId", placeholder: "Search Gemini models" },
      { kind: "textarea", key: "prompt", label: "Prompt" },
      { kind: "structured-output", key: "outputSchema", label: "Structured output" },
      { kind: "number", key: "maxOutputTokens", label: "Max output tokens", fallbackValue: 1024 },
      { kind: "number", key: "timeoutMs", label: "Timeout (ms)", fallbackValue: 30000 },
    ],
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;
