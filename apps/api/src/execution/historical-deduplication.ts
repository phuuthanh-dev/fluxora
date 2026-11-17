import { createHmac } from "node:crypto";
import { boundedItems, itemField } from "./data-transform";
import type { WorkflowItem } from "./item-stream";
import { NodeFailure } from "./node-failure";

export type HistoricalDeduplicationMode = "new" | "higher" | "later";
export type HistoricalDeduplicationState = { mode: HistoricalDeduplicationMode | null; hashes: string[]; maximum: number | null };

// Canonicalize objects so equal values compare equally regardless of key order.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return ["object", Object.keys(object).sort().map((key) => [key, canonical(object[key])])];
  }
  return [typeof value, value];
}

/** Pure comparison; the caller is responsible for locking and persisting the result. */
export function compareHistoricalItems(
  items: WorkflowItem[], fields: string[], mode: HistoricalDeduplicationMode,
  history: HistoricalDeduplicationState, limit: number, key: Buffer,
): { keptIndexes: number[]; history: HistoricalDeduplicationState } {
  boundedItems(items);
  if (!fields.length || key.length !== 32 || !Number.isInteger(limit) || limit < 1 || limit > 10000 || (mode !== "new" && fields.length !== 1)) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Review the duplicate comparison settings.", false);
  }
  if (history.mode !== null && history.mode !== mode) throw new NodeFailure("DEDUP_MODE_CHANGED", "Clear the duplicate history before changing the comparison type.", false);
  const hashes = history.hashes.slice(-limit);
  const seen = new Set(hashes);
  const incoming = new Set<string>();
  let maximum = history.maximum;
  const keptIndexes: number[] = [];
  for (const [index, item] of items.entries()) {
    const values = fields.map((field) => itemField(item, field));
    if (values.some((value) => value === undefined || value === null)) {
      throw new NodeFailure("INVALID_INPUT", "A selected comparison field is missing or empty.", false);
    }
    if (mode === "new") {
      // Keyed digests avoid persisting the selected values or easily reversible hashes.
      const digest = createHmac("sha256", key).update("fluxora-dedup-v1\0").update(JSON.stringify(canonical(values))).digest("hex");
      incoming.add(digest);
      if (!seen.has(digest)) keptIndexes.push(index);
      continue;
    }
    const raw = values[0];
    const value = mode === "higher" ? (typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN) : typeof raw === "string" && /^\d{4}-\d\d-\d\d(?:T|$)/.test(raw) ? Date.parse(raw) : NaN;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new NodeFailure("INVALID_INPUT", mode === "higher" ? "The comparison field must contain a number." : "The comparison field must contain an ISO date.", false);
    }
    if (history.maximum === null || value > history.maximum) keptIndexes.push(index);
    if (maximum === null || value > maximum) maximum = value;
  }
  if (incoming.size > limit) throw new NodeFailure("DEDUP_HISTORY_LIMIT", "The number of unique input values exceeds the history size.", false);
  for (const digest of incoming) if (!seen.has(digest)) hashes.push(digest);
  return { keptIndexes, history: { mode, hashes: hashes.slice(-limit), maximum } };
}
