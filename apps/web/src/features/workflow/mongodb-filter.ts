export type MongoFilterOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "exists";
export type MongoFilterRow = { field: string; operator: MongoFilterOperator; type: "text" | "number" | "boolean"; value: string };
const operators = new Set(["$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$exists"]);

/** Only decode a losslessly representable subset; everything else stays JSON. */
export function parseMongoFilter(value: string): MongoFilterRow[] | null {
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const object = raw as Record<string, unknown>;
    const conditions = Object.keys(object).length === 1 && Array.isArray(object.$and) ? object.$and : [object];
    if (object.$and && conditions.length === 0) return null;
    const rows: MongoFilterRow[] = [];
    for (const condition of conditions) {
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) return null;
      if (Array.isArray(object.$and) && Object.keys(condition).length === 0) return null;
      for (const [field, input] of Object.entries(condition)) {
        if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(field)) return null;
        let op = "eq";
        let operand = input;
        if (input && typeof input === "object" && !Array.isArray(input)) {
          const entries = Object.entries(input);
          if (entries.length !== 1 || !operators.has(entries[0]![0])) return null;
          op = entries[0]![0].slice(1); operand = entries[0]![1];
        }
        if (!["string", "number", "boolean"].includes(typeof operand)) return null;
        if (typeof operand === "number" && !Number.isFinite(operand)) return null;
        if (op === "exists" && typeof operand !== "boolean") return null;
        rows.push({ field, operator: op as MongoFilterOperator, type: typeof operand === "number" ? "number" : typeof operand === "boolean" ? "boolean" : "text", value: String(operand) });
      }
    }
    return rows;
  } catch { return null; }
}

export function buildMongoFilter(rows: MongoFilterRow[]): string {
  const conditions = rows.map((row) => {
    if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(row.field)) throw new Error("Enter a valid field name for each condition.");
    if (!operators.has(`$${row.operator}`)) throw new Error("Choose a valid operator.");
    if (row.operator === "exists" && !["true", "false"].includes(row.value)) throw new Error("Choose whether the field exists.");
    let value: string | number | boolean = row.value;
    if (row.type === "number") {
      if (!row.value.trim() || !Number.isFinite(Number(row.value))) throw new Error("Enter a valid number.");
      value = Number(row.value);
    } else if (row.type === "boolean") {
      if (!["true", "false"].includes(row.value)) throw new Error("Choose true or false.");
      value = row.value === "true";
    }
    if (row.operator === "exists" && typeof value !== "boolean") throw new Error("Choose whether the field exists.");
    return { [row.field]: row.operator === "eq" ? value : { [`$${row.operator}`]: value } };
  });
  return JSON.stringify(conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { $and: conditions });
}
