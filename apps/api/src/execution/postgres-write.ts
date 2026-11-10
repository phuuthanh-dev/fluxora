import { Client, type ClientConfig } from "pg";
import { rootCertificates } from "node:tls";
import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { preservesJsonDecimal } from "./json-decimal";
import { NodeFailure } from "./node-failure";
import { postgresCaCertificates, validatePostgresCredential, type PostgresCredential } from "./postgres-read";
import { resolvePostgresTarget } from "./postgres-target";
import { uncertainDelivery } from "./provider-request-policy";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";
import { requireResolvedSelection, requireSafeSelectionNumber } from "./relational-selection-validation";

type WriteValue = string | number | boolean | null;
type Mode = "insert" | "upsert";
const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value) || ["__proto__", "prototype", "constructor"].includes(value)) throw new NodeFailure("INVALID_INPUT", "Choose valid PostgreSQL identifiers.", false);
  return `"${value}"`;
};

/** Build a single bounded write. Only identifiers enter SQL text; values are bound. */
export function buildPostgresWrite(config: Record<string, unknown>, mode: Mode) {
  const allowed = new Set(["credentialId", "schema", "table", "fields", "conflictColumn", "retryAttempts", "timeoutMs"]);
  if (Object.keys(config).some((key) => !allowed.has(key))) throw new NodeFailure("INVALID_INPUT", "Unsupported PostgreSQL write field.", false);
  requireResolvedSelection(config, ["fields", "conflictColumn"], "PostgreSQL");
  const type = mode === "insert" ? "action.postgres.insert-row" : "action.postgres.upsert-row";
  const issue = nodeConfigIssues(type, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const target = `${identifier(config.schema)}.${identifier(config.table)}`;
  if (!Array.isArray(config.fields) || config.fields.length < 1 || config.fields.length > 50) throw new NodeFailure("INVALID_INPUT", "Add between 1 and 50 column values.", false);
  const names: string[] = [], values: WriteValue[] = [];
  for (const raw of config.fields) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new NodeFailure("INVALID_INPUT", "Enter valid column values.", false);
    const field = raw as Record<string, unknown>;
    if (Object.keys(field).some((key) => !["column", "type", "value"].includes(key))) throw new NodeFailure("INVALID_INPUT", "Enter valid column values.", false);
    const column = identifier(field.column);
    if (names.includes(column)) throw new NodeFailure("INVALID_INPUT", "Choose each column only once.", false);
    names.push(column);
    const value = field.value;
    if (field.type === "null" && (value === undefined || value === "")) values.push(null);
    else if (field.type === "text" && typeof value === "string") values.push(value);
    else if (field.type === "boolean" && (value === true || value === false || value === "true" || value === "false")) values.push(value === true || value === "true");
    else if (field.type === "number" && (typeof value === "number" || typeof value === "string" && /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) && value.length <= 100)) {
      const number = Number(value); requireSafeSelectionNumber(number);
      if (typeof value === "string" && !preservesJsonDecimal(value.trim(), number)) throw new NodeFailure("INVALID_INPUT", "Use text for values requiring higher numeric precision.", false);
      values.push(number);
    } else if (field.type === "expression" && (value === null || typeof value === "string" && value.length > 0 || typeof value === "boolean" || typeof value === "number")) {
      requireSafeSelectionNumber(value); values.push(value as WriteValue);
    } else throw new NodeFailure("INVALID_INPUT", "Enter valid column values.", false);
  }
  if (Buffer.byteLength(JSON.stringify(values)) > 200_000) throw new NodeFailure("INVALID_INPUT", "PostgreSQL row must be under 200 KB.", false);
  let conflict = "";
  if (mode === "upsert") {
    const key = identifier(config.conflictColumn);
    if (!names.includes(key)) throw new NodeFailure("INVALID_INPUT", "Include the conflict column in the row values.", false);
    const updates = names.filter((name) => name !== key);
    if (!updates.length) throw new NodeFailure("INVALID_INPUT", "Add at least one value besides the conflict column.", false);
    conflict = ` ON CONFLICT (${key}) DO UPDATE SET ${updates.map((name) => `${name} = EXCLUDED.${name}`).join(", ")}`;
  }
  return { text: `INSERT INTO ${target} (${names.join(", ")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})${conflict}`, values };
}

type WriteClient = { connect(): Promise<void>; query(text: string, values: WriteValue[]): Promise<{ rowCount: number | null }>; end(): Promise<void> };
type Dependencies = { resolve: typeof resolvePostgresTarget; createClient: (config: ClientConfig) => WriteClient };
export async function writePostgresRow(credential: PostgresCredential, query: ReturnType<typeof buildPostgresWrite>, dependencies: Dependencies = { resolve: resolvePostgresTarget, createClient: (config) => new Client(config) as unknown as WriteClient }) {
  const target = await dependencies.resolve(credential.host);
  const ca = postgresCaCertificates(credential.caCertificate);
  const client = dependencies.createClient({ host: target.address, port: credential.port, database: credential.database, user: credential.username, password: credential.password, ssl: { servername: target.servername, rejectUnauthorized: true, ...(ca ? { ca: [...rootCertificates, ...ca] } : {}) }, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, query_timeout: 15_000 });
  let sent = false;
  try {
    await client.connect();
    sent = true;
    const result = await client.query(query.text, query.values);
    if (result.rowCount !== 1) throw uncertainDelivery("PostgreSQL");
    return { accepted: true };
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    if (sent) throw uncertainDelivery("PostgreSQL");
    throw new NodeFailure("POSTGRES_ERROR", "PostgreSQL connection failed. Check the connection and permissions.", false);
  } finally { await client.end().catch(() => undefined); }
}
export async function executePostgresWrite(config: Record<string, unknown>, mode: Mode, runMode: "mock" | "live", workspaceId: string, credentials: CredentialService) {
  const query = buildPostgresWrite(config, mode);
  if (runMode === "mock") return { status: "succeeded" as const, route: "success" as const, output: { accepted: true, schema: config.schema, table: config.table } };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a PostgreSQL connection.", false);
  const credential = validatePostgresCredential(await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.POSTGRES));
  assertNoCredentialInProviderValue({ schema: config.schema, table: config.table }, credential.password);
  const result = await writePostgresRow(credential, query);
  return { status: "succeeded" as const, route: "success" as const, output: { ...result, schema: config.schema, table: config.table } };
}
