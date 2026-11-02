import { NodeFailure } from "./node-failure";

export type PostgresCondition = { column: string; operator: "equals" | "notEquals" | "greaterThan" | "lessThan"; value: string | number | boolean };
export type PostgresSelection = { columns: string[]; conditions: PostgresCondition[]; orderBy?: string; orderDirection?: "asc" | "desc"; offset?: number };
type SelectInput = PostgresSelection & { schema: string; table: string; limit: number };
const operators = { equals: "=", notEquals: "<>", greaterThan: ">", lessThan: "<" } as const;

/** Values use bind parameters; identifiers are strictly validated and quoted. */
export function buildPostgresSelect(input: SelectInput) {
  const identifier = (value: unknown) => {
    if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value)) throw new NodeFailure("INVALID_INPUT", "Enter a valid PostgreSQL identifier.", false);
    return `"${value}"`;
  };
  if (!input || typeof input !== "object" || !Array.isArray(input.columns) || input.columns.length > 50 || !Array.isArray(input.conditions) || input.conditions.length > 20 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new NodeFailure("INVALID_INPUT", "Invalid PostgreSQL selection or limit.", false);
  if (new Set(input.columns).size !== input.columns.length) throw new NodeFailure("INVALID_INPUT", "Choose each PostgreSQL column only once.", false);
  if (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 100_000 || (input.offset > 0 && !input.orderBy))) throw new NodeFailure("INVALID_INPUT", "Choose an ordering column and an offset between 0 and 100000.", false);
  if (input.orderDirection !== undefined && input.orderDirection !== "asc" && input.orderDirection !== "desc") throw new NodeFailure("INVALID_INPUT", "Choose ascending or descending order.", false);
  if (input.orderDirection !== undefined && !input.orderBy) throw new NodeFailure("INVALID_INPUT", "Choose a column before setting the sort direction.", false);
  if (input.orderBy !== undefined && (typeof input.orderBy !== "string" || !input.orderBy)) throw new NodeFailure("INVALID_INPUT", "Choose a valid ordering column.", false);
  const table = `${identifier(input.schema)}.${identifier(input.table)}`;
  const columns = input.columns.length ? input.columns.map(identifier).join(", ") : "*";
  const values: Array<string | number | boolean> = [];
  const where = input.conditions.map((condition) => {
    if (!condition || typeof condition !== "object" || Object.keys(condition).some((key) => !["column", "operator", "value"].includes(key)) || !Object.hasOwn(operators, condition.operator) || !["string", "number", "boolean"].includes(typeof condition.value) || (typeof condition.value === "number" && !Number.isFinite(condition.value)) || (typeof condition.value === "string" && condition.value.length > 10_000)) throw new NodeFailure("INVALID_INPUT", "Invalid PostgreSQL condition.", false);
    values.push(condition.value);
    return `${identifier(condition.column)} ${operators[condition.operator]} $${values.length}`;
  });
  const order = input.orderBy ? ` ORDER BY ${identifier(input.orderBy)} ${(input.orderDirection ?? "asc").toUpperCase()}` : "";
  const offset = input.offset ? ` OFFSET ${input.offset}` : "";
  return { text: `SELECT ${columns} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${order} LIMIT ${input.limit}${offset}`, values };
}
