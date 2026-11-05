import type { WorkflowNodeData } from "./node-catalog";

/** Pass only selection keys; the parent must merge the result into the node config. */
export type RelationalSelection = Record<string, unknown>;
export type RelationalProvider = "postgres" | "supabase";
export type RelationalOperator = "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterThanOrEqual" | "lessThanOrEqual" | "isNull" | "isNotNull";
export type RelationalRow = { column: string; operator: RelationalOperator; type: "string" | "number" | "boolean"; value: string };
export type RelationalOrder = { column: string; direction: "asc" | "desc"; nulls: "" | "first" | "last" };
export type RelationalForm = { columns: string[]; conditions: RelationalRow[]; order: RelationalOrder[]; offset: string; original?: RelationalSelection };
export type RelationalBaseline = { value: string; contextKey: string; provider: RelationalProvider };
export type RelationalDraft =
  | { mode: "visual"; baseline: RelationalBaseline; form: RelationalForm }
  | { mode: "manual"; baseline: RelationalBaseline; text: string };
export type RelationalColumnOption = { value: string; label: string };
export type RelationalMetadata = { status: "available"; columns: RelationalColumnOption[]; partial: boolean } | { status: "unavailable" };

export const relationalSelectionKeys: Record<RelationalProvider, readonly string[]> = { postgres: ["columns", "conditions", "orderBy", "orderDirection", "offset"], supabase: ["columns", "filters", "order", "offset"] };
const keys = new Set([...relationalSelectionKeys.postgres, ...relationalSelectionKeys.supabase]);
const postgresOperators = new Set<RelationalOperator>(["equals", "notEquals", "greaterThan", "lessThan"]);
const supabaseOperators = new Set<RelationalOperator>([...postgresOperators, "greaterThanOrEqual", "lessThanOrEqual", "isNull", "isNotNull"]);
const reserved = new Set(["select", "order", "limit", "offset", "and", "or", "not", "columns", "on_conflict"]);
const identifier = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
const expression = (value: string) => value.includes("{{") || value.includes("}}");
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isNullOperator = (operator: RelationalOperator) => operator === "isNull" || operator === "isNotNull";
const allowedOperators = (provider: RelationalProvider) => provider === "postgres" ? postgresOperators : supabaseOperators;
const maxOffset = (provider: RelationalProvider) => provider === "postgres" ? 100_000 : 1_000_000;
const bytes = (value: string) => new TextEncoder().encode(value).length;

// Compare the typed decimal magnitude to MAX_SAFE_INTEGER before rounding it to
// Number; scientific notation and fractional tails near the boundary matter.
function exceedsSafeIntegerMagnitude(text: string): boolean {
  const match = /^[+-]?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return false;
  const whole = match[1] ?? "";
  const digits = whole + (match[2] ?? "");
  const leading = digits.length - digits.replace(/^0+/, "").length;
  const significant = digits.slice(leading);
  if (!significant) return false;
  const position = whole.length + Number(match[3] ?? 0) - leading;
  if (position !== 16) return position > 16;
  const integer = significant.slice(0, 16).padEnd(16, "0");
  const boundary = "9007199254740991";
  return integer > boundary || (integer === boundary && /[1-9]/.test(significant.slice(16)));
}

export function relationalBaseline(value: RelationalSelection, contextKey: string, provider: RelationalProvider): RelationalBaseline {
  return { value: JSON.stringify(value), contextKey, provider };
}

export function isRelationalBaselineCurrent(baseline: RelationalBaseline, value: RelationalSelection, contextKey: string, provider: RelationalProvider): boolean {
  return baseline.provider === provider && baseline.contextKey === contextKey && baseline.value === JSON.stringify(value);
}

/** Unsupported shapes, including unknown nested properties and expressions, stay in advanced settings. */
export function parseRelationalSelection(value: RelationalSelection, provider: RelationalProvider): RelationalForm | null {
  if (!object(value) || Object.keys(value).some((key) => !keys.has(key))) return null;
  if (provider === "postgres" ? ("filters" in value || "order" in value) : ("conditions" in value || "orderBy" in value || "orderDirection" in value)) return null;
  const columns = value.columns === undefined ? [] : value.columns;
  const conditionValue = provider === "postgres" ? value.conditions : value.filters;
  const conditions = conditionValue === undefined ? [] : conditionValue;
  if (!Array.isArray(columns) || columns.length > 50 || columns.some((column) => typeof column !== "string" || !identifier.test(column)) || new Set(columns).size !== columns.length) return null;
  if (!Array.isArray(conditions) || conditions.length > 20) return null;
  const rows: RelationalRow[] = [];
  for (const condition of conditions) {
    if (!object(condition) || Object.keys(condition).some((key) => !["column", "operator", "value"].includes(key)) || typeof condition.column !== "string" || !identifier.test(condition.column) || (provider === "supabase" && reserved.has(condition.column)) || typeof condition.operator !== "string" || !allowedOperators(provider).has(condition.operator as RelationalOperator)) return null;
    const operator = condition.operator as RelationalOperator;
    if (isNullOperator(operator)) {
      if (Object.hasOwn(condition, "value")) return null;
      rows.push({ column: condition.column, operator, type: "string", value: "" });
      continue;
    }
    const operand = condition.value;
    if (typeof operand !== "string" && typeof operand !== "number" && typeof operand !== "boolean") return null;
    if (typeof operand === "number" && (!Number.isFinite(operand) || (Number.isInteger(operand) && !Number.isSafeInteger(operand)))) return null;
    if (typeof operand === "string" && (expression(operand) || (provider === "postgres" ? operand.length > 10_000 : bytes(operand) > 1_000 || /[\u0000-\u001f\u007f]/.test(operand)))) return null;
    rows.push({ column: condition.column, operator, type: typeof operand as RelationalRow["type"], value: String(operand) });
  }
  let order: RelationalOrder[] = [];
  if (provider === "postgres") {
    const column = value.orderBy === undefined ? "" : value.orderBy;
    const direction = value.orderDirection === undefined ? "asc" : value.orderDirection;
    if (typeof column !== "string" || (column !== "" && !identifier.test(column)) || (direction !== "asc" && direction !== "desc") || (!column && value.orderDirection !== undefined && value.orderDirection !== "")) return null;
    if (column) order = [{ column, direction, nulls: "" }];
  } else {
    const entries = value.order === undefined ? [] : value.order;
    if (!Array.isArray(entries) || entries.length > 10) return null;
    for (const entry of entries) {
      if (!object(entry) || Object.keys(entry).some((key) => !["column", "direction", "nulls"].includes(key)) || typeof entry.column !== "string" || !identifier.test(entry.column) || (entry.direction !== "asc" && entry.direction !== "desc") || (entry.nulls !== undefined && entry.nulls !== "first" && entry.nulls !== "last")) return null;
      order.push({ column: entry.column, direction: entry.direction, nulls: entry.nulls ?? "" });
    }
  }
  const offset = value.offset === undefined ? 0 : value.offset;
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > maxOffset(provider) || (offset > 0 && !order.length)) return null;
  return { columns: [...columns], conditions: rows, order, offset: String(offset), original: value };
}

/** Metadata is advisory: exact manual names remain usable even with a complete-looking list. */
export function buildRelationalSelection(form: RelationalForm, provider: RelationalProvider): RelationalSelection {
  const checkColumn = (column: string) => {
    if (!identifier.test(column)) throw new Error("Enter a valid column name (letters, numbers, _ or $, starting with a letter or _; up to 63 characters).");
  };
  if (form.columns.length > 50 || new Set(form.columns).size !== form.columns.length) throw new Error("Choose up to 50 different columns.");
  form.columns.forEach(checkColumn);
  if (form.conditions.length > 20) throw new Error("Use up to 20 conditions.");
  const conditions = form.conditions.map((row) => {
    checkColumn(row.column);
    if (provider === "supabase" && reserved.has(row.column)) throw new Error(`“${row.column}” is reserved and cannot be used as a Supabase filter.`);
    if (!allowedOperators(provider).has(row.operator)) throw new Error("Choose a valid comparison.");
    if (isNullOperator(row.operator)) return { column: row.column, operator: row.operator };
    let value: string | number | boolean;
    if (row.type === "number") {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(row.value) || !Number.isFinite(Number(row.value))) throw new Error("Enter a valid number for each number condition.");
      value = Number(row.value);
      if ((Number.isInteger(value) && !Number.isSafeInteger(value)) || (Math.abs(value) >= Number.MAX_SAFE_INTEGER && exceedsSafeIntegerMagnitude(row.value))) throw new Error("This number is too large to represent exactly. Choose Text to preserve its digits.");
    } else if (row.type === "boolean") {
      if (row.value !== "true" && row.value !== "false") throw new Error("Choose true or false.");
      value = row.value === "true";
    } else if (row.type === "string") {
      if (expression(row.value)) throw new Error("Use advanced settings for expressions.");
      if (provider === "postgres" ? row.value.length > 10_000 : bytes(row.value) > 1_000 || /[\u0000-\u001f\u007f]/.test(row.value)) throw new Error(provider === "postgres" ? "A text value is too long." : "Supabase text values must be at most 1,000 UTF-8 bytes and contain no control characters.");
      value = row.value;
    } else throw new Error("Choose a valid value type.");
    return { column: row.column, operator: row.operator, value };
  });
  if (form.order.length > (provider === "postgres" ? 1 : 10)) throw new Error(provider === "postgres" ? "Choose at most one sort column." : "Choose up to 10 sort columns.");
  form.order.forEach((entry) => {
    checkColumn(entry.column);
    if (entry.direction !== "asc" && entry.direction !== "desc") throw new Error("Choose a valid sort direction.");
    if (entry.nulls !== "" && (provider === "postgres" || (entry.nulls !== "first" && entry.nulls !== "last"))) throw new Error("Choose a valid null ordering.");
  });
  if (!/^\d+$/.test(form.offset) || !Number.isSafeInteger(Number(form.offset)) || Number(form.offset) > maxOffset(provider)) throw new Error(`Enter a whole number of rows to skip from 0 to ${maxOffset(provider).toLocaleString("en-US")}.`);
  const offset = Number(form.offset);
  if (offset > 0 && !form.order.length) throw new Error(`${provider === "postgres" ? "PostgreSQL" : "Supabase"} requires a sort order when skipping rows.`);
  if (provider === "supabase") {
    const params = new URLSearchParams({ select: form.columns.length ? form.columns.join(",") : "*", limit: "100" });
    const ops: Record<string, string> = { equals: "eq", notEquals: "neq", greaterThan: "gt", lessThan: "lt", greaterThanOrEqual: "gte", lessThanOrEqual: "lte", isNull: "is", isNotNull: "not.is" };
    conditions.forEach((row) => params.append(row.column, `${ops[row.operator]}.${"value" in row ? String(row.value) : "null"}`));
    if (form.order.length) params.set("order", form.order.map((entry) => `${entry.column}.${entry.direction}${entry.nulls ? `.nulls${entry.nulls}` : ""}`).join(","));
    if (offset || form.original?.offset !== undefined) params.set("offset", String(offset));
    if (params.toString().length > 8_000) throw new Error("The Supabase selection is too long; reduce the number or size of filters.");
  }
  // Keep original key presence and values for every untouched section.
  const originalForm = form.original ? parseRelationalSelection(form.original, provider) : null;
  const result: RelationalSelection = originalForm ? { ...form.original } : {};
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  if (!originalForm || changed(form.columns, originalForm.columns)) result.columns = [...form.columns];
  if (!originalForm || changed(form.conditions, originalForm.conditions)) result[provider === "postgres" ? "conditions" : "filters"] = conditions;
  if (!originalForm || changed(form.order, originalForm.order)) {
    if (provider === "postgres") {
      delete result.orderBy; delete result.orderDirection;
      if (form.order[0]) { result.orderBy = form.order[0].column; result.orderDirection = form.order[0].direction; }
    } else result.order = form.order.map((entry) => ({ column: entry.column, direction: entry.direction, ...(entry.nulls ? { nulls: entry.nulls } : {}) }));
  }
  if (!originalForm || offset !== Number(originalForm.offset)) result.offset = offset;
  return result;
}

/** Advanced JSON is not interpreted; only selection keys may be replaced by the parent. */
export function parseRelationalManual(text: string, provider?: RelationalProvider): RelationalSelection {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Enter valid JSON for the selection."); }
  const allowed = provider ? new Set(relationalSelectionKeys[provider]) : keys;
  if (!object(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Enter an object containing only selection keys for this provider.");
  return value;
}

/** Upgrade only the draft node type. Retain every config field unchanged. */
