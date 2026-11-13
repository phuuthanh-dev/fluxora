import { isDataTransformNode, nodeConfigIssues, type WorkflowNode } from "@workflow/contracts";
import { resolveExpressions } from "./expression";
import { maximumItemBytes, maximumOutputItems, type WorkflowItem } from "./item-stream";
import { NodeFailure } from "./node-failure";

export function boundedItems(items: WorkflowItem[]): WorkflowItem[] {
  if (items.length > maximumOutputItems) throw new NodeFailure("ITEM_LIMIT_EXCEEDED", "A node can return at most 100 items.", false);
  if (Buffer.byteLength(JSON.stringify(items), "utf8") > maximumItemBytes) throw new NodeFailure("ITEM_SIZE_EXCEEDED", "Item data exceeds the 1 MB limit.", false);
  return items;
}

/** Read own properties through the existing persisted-value/redaction guard. */
export function itemField(item: WorkflowItem, path: string): unknown {
  const guarded = (value: unknown) => resolveExpressions("{{ $json }}", { $json: value }, { persistedItem: item.persisted });
  let value: unknown = item.json;
  for (const part of path.split(".")) {
    // Preserve the expression engine's redacted-value rule even when an
    // ancestor was replaced with a redaction marker in a persisted receipt.
    if (typeof value === "string") guarded(value);
    value = value !== null && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, part) ? (value as Record<string, unknown>)[part] : undefined;
  }
  return guarded(value);
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const sources = (item: WorkflowItem) => item.sources ?? (item.pairedItem ? [item.pairedItem] : []);

/** Objects compare by content regardless of property order; arrays keep their order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  if (object(value)) return ["object", Object.keys(value).sort().map((key) => [key, canonical(value[key])])];
  return ["value", value];
}

export function transformItems(node: WorkflowNode, inputs: WorkflowItem[]): WorkflowItem[] {
  if (!isDataTransformNode(node.type)) return inputs;
  const config = node.config;
  const issue = nodeConfigIssues(node.type, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  boundedItems(inputs);
  if (node.type === "action.aggregate") return boundedItems([{
    json: { [String(config.outputField)]: inputs.map((item) => item.json) },
    sources: inputs.flatMap(sources), persisted: inputs.some((item) => item.persisted),
  }]);
  if (node.type === "action.limit") {
    const count = Number(config.maxItems);
    return count === 0 ? [] : config.keep === "last" ? inputs.slice(-count) : inputs.slice(0, count);
  }
  if (node.type === "action.remove-duplicates") {
    const fields = typeof config.fields === "string" ? config.fields.split(",").map((field) => field.trim()) : [];
    const seen = new Set<string>();
    return inputs.filter((item) => {
      let value: unknown;
      if (config.compare === "selected") {
        value = fields.map((field) => {
          const selected = itemField(item, field);
          return selected === undefined ? ["missing"] : ["value", canonical(selected)];
        });
      } else {
        // Protect persisted redacted values before comparing the whole item.
        value = structuredClone(resolveExpressions("{{ $json }}", { $json: item.json }, { persistedItem: item.persisted }));
        if (config.compare === "except" && object(value)) for (const field of fields) {
          const segments = field.split(".");
          let parent: Record<string, unknown> | undefined = value;
          for (const segment of segments.slice(0, -1)) parent = parent && object(parent[segment]) ? parent[segment] as Record<string, unknown> : undefined;
          if (parent) delete parent[segments.at(-1)!];
        }
        value = canonical(value);
      }
      const key = JSON.stringify(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (node.type === "action.sort") {
    const type = config.valueType ?? "text";
    const entries = inputs.map((item, index) => {
      const raw = itemField(item, String(config.field));
      if (raw === null || raw === undefined) return { item, index, value: null };
      const value = type === "date" ? typeof raw === "string" ? Date.parse(raw) : NaN : raw;
      if (type === "text" ? typeof value !== "string" : typeof value !== "number" || !Number.isFinite(value)) throw new NodeFailure("INVALID_INPUT", "Sort values must match the selected type. Missing values are placed last.", false);
      return { item, index, value: value as string | number };
    });
    const direction = config.direction === "desc" ? -1 : 1;
    entries.sort((a, b) => a.value === null ? b.value === null ? a.index - b.index : 1 : b.value === null ? -1 : a.value === b.value ? a.index - b.index : (a.value < b.value ? -1 : 1) * direction);
    return entries.map((entry) => entry.item);
  }
  const result: WorkflowItem[] = [];
  for (const item of inputs) {
    const values = itemField(item, String(config.field));
    if (!Array.isArray(values)) throw new NodeFailure("INVALID_INPUT", "The selected Split Out field must contain an array.", false);
    const rest = config.include === "all" ? structuredClone(item.json) : {};
    // Remove only the split field, retaining sibling fields in nested objects.
    let parent = rest;
    const segments = String(config.field).split(".");
    for (const segment of segments.slice(0, -1)) { if (!object(parent[segment])) break; parent = parent[segment]; }
    delete parent[segments.at(-1)!];
    for (const value of values) {
      const data = config.destination ? { [String(config.destination)]: value } : object(value) ? value : { value };
      result.push({ json: { ...rest, ...data }, ...(item.pairedItem ? { pairedItem: item.pairedItem } : {}), sources: sources(item), ...(item.persisted ? { persisted: true } : {}) });
      boundedItems(result);
    }
  }
  return result;
}

/** n8n-style matching subset: first right match, strict types, shallow Input2 precedence. */
export function matchItems(config: Record<string, unknown>, left: WorkflowItem[], right: WorkflowItem[]): WorkflowItem[] {
  const issue = nodeConfigIssues("action.merge", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  boundedItems(left); boundedItems(right);
  const key = (item: WorkflowItem, field: string) => {
    const value = itemField(item, field);
    if (value === null || value === undefined) return undefined;
    if (!["string", "number", "boolean"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value)) throw new NodeFailure("INVALID_INPUT", "Merge keys must be text, numbers or booleans.", false);
    return JSON.stringify([typeof value, value]);
  };
  const lookup = new Map<string, WorkflowItem>();
  for (const item of right) { const value = key(item, String(config.field2)); if (value !== undefined && !lookup.has(value)) lookup.set(value, item); }
  const result: WorkflowItem[] = [];
  for (const item of left) {
    const value = key(item, String(config.field1));
    const match = value === undefined ? undefined : lookup.get(value);
    if (match) result.push({ json: { ...item.json, ...match.json }, pairedItem: item.pairedItem, sources: [...sources(item), ...sources(match)], persisted: item.persisted || match.persisted });
    else if (config.outputType === "enrich-input1") result.push(item);
  }
  return boundedItems(result);
}
