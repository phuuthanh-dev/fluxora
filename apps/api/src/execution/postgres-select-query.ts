import { NodeFailure } from "./node-failure";

type Condition = { column: string; operator: "equals" | "notEquals" | "greaterThan" | "lessThan"; value: string | number | boolean };
type SelectInput = { schema: string; table: string; columns: string[]; conditions: Condition[]; limit: number };
const operators = { equals: "=", notEquals: "<>", greaterThan: ">", lessThan: "<" } as const;

/** Values use bind parameters; identifiers are strictly validated and quoted. */
export function buildPostgresSelect(input: SelectInput) {
  const identifier = (value: unknown) => {
    if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value)) throw new NodeFailure("INVALID_INPUT", "Enter a valid PostgreSQL identifier.", false);
    return `"${value}"`;
  };
  if (!input || typeof input !== "object" || !Array.isArray(input.columns) || input.columns.length > 50 || !Array.isArray(input.conditions) || input.conditions.length > 20 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new NodeFailure("INVALID_INPUT", "Invalid PostgreSQL selection or limit.", false);
  const table = `${identifier(input.schema)}.${identifier(input.table)}`;
  const columns = input.columns.length ? input.columns.map(identifier).join(", ") : "*";
  const values: Array<string | number | boolean> = [];
  const where = input.conditions.map((condition) => {
    if (!condition || typeof condition !== "object" || !Object.hasOwn(operators, condition.operator) || !["string", "number", "boolean"].includes(typeof condition.value) || (typeof condition.value === "number" && !Number.isFinite(condition.value)) || (typeof condition.value === "string" && condition.value.length > 10_000)) throw new NodeFailure("INVALID_INPUT", "Invalid PostgreSQL condition.", false);
    values.push(condition.value);
    return `${identifier(condition.column)} ${operators[condition.operator]} $${values.length}`;
  });
  return { text: `SELECT ${columns} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} LIMIT ${input.limit}`, values };
}
