import { getOperationMetadata } from "@workflow/contracts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;

/** Describe the recorded run, not the potentially edited draft in the inspector. */
export function executionPagination(nodeType: string, input: unknown, output: unknown, nodeVersion?: unknown) {
  const result = record(output);
  const pagination = getOperationMetadata(nodeType, nodeVersion)?.pagination;
  if (!result || !pagination) return undefined;

  let selected = pagination;
  if (selected.kind === "conditional") {
    const config = record(record(input)?.config);
    if (!config) return undefined;
    const value = config[selected.selector] ?? selected.fallback;
    const matched = selected.cases.find((entry) => entry.values.some((candidate) => candidate === value));
    if (!matched) return undefined;
    selected = matched.pagination;
  }

  if (selected.kind === "offset") {
    if (!Object.hasOwn(result, selected.page)) return undefined;
    return { kind: "offset" as const, input: selected.input, caveat: selected.caveat };
  }
  if (selected.kind !== "continuation" || !Object.hasOwn(result, selected.next)) return undefined;
  const cursor = result[selected.next];
  const available = (typeof cursor === "string" && cursor !== "" && cursor !== "[REDACTED]") || (typeof cursor === "number" && Number.isSafeInteger(cursor));
  return { kind: "continuation" as const, input: selected.input, next: selected.next, available, caveat: selected.caveat };
}
