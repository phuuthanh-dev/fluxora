import { Client, type ClientConfig } from "pg";
import QueryStream from "pg-query-stream";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { NodeFailure } from "./node-failure";
import { requireResolvedSelection } from "./relational-selection-validation";
import { buildPostgresSelect, type PostgresSelection } from "./postgres-select-query";
import { resolvePostgresTarget } from "./postgres-target";
import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";

export type PostgresCredential = { host: string; port: number; database: string; username: string; password: string; caCertificate?: string };

/** Accept only bounded CA certificate PEM blocks, never private keys or arbitrary text. */
export function postgresCaCertificates(value: unknown): string[] | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 32_768) throw new NodeFailure("POSTGRES_CA_INVALID", "Enter a valid PostgreSQL CA certificate in PEM format.", false);
  const pemPattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  const certificates = value.match(pemPattern) ?? [];
  if (certificates.length < 1 || certificates.length > 4 || value.replace(pemPattern, "").trim() !== "") throw new NodeFailure("POSTGRES_CA_INVALID", "Enter a valid PostgreSQL CA certificate in PEM format.", false);
  try {
    if (certificates.some((pem) => !new X509Certificate(pem).ca)) throw new Error("Not a CA certificate");
  } catch {
    throw new NodeFailure("POSTGRES_CA_INVALID", "Enter a valid PostgreSQL CA certificate in PEM format.", false);
  }
  return certificates;
}

export function validatePostgresCredential(value: Record<string, unknown>): PostgresCredential {
  const { host, database, username, password, port } = value;
  if (typeof host !== "string" || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(host) || typeof database !== "string" || !database || database.length > 63 || /[\0\r\n]/.test(database) || typeof username !== "string" || !username || username.length > 256 || /[\0\r\n]/.test(username) || typeof password !== "string" || !password || password.length > 1024 || typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a PostgreSQL host, port, database, username and password.", false);
  const ca = postgresCaCertificates(value.caCertificate);
  return { host, port, database, username, password, ...(ca ? { caCertificate: ca.join("\n") } : {}) };
}

/** Read-only transaction, pinned DNS result, verified TLS and bounded streamed output. */
type ReadClient = { connect(): Promise<void>; query(sql: string): Promise<unknown>; query(query: QueryStream): QueryStream; end(): Promise<void> };
type Dependencies = { resolve: typeof resolvePostgresTarget; createClient: (config: ClientConfig) => ReadClient };

export async function readPostgresRows(credential: PostgresCredential, schema: string, table: string, limit: number, dependencies?: Dependencies, selection: PostgresSelection = { columns: [], conditions: [] }) {
  return readPostgresQuery(credential, buildPostgresSelect({ schema, table, limit, ...selection }), dependencies);
}

async function readPostgresQuery(credential: PostgresCredential, query: { text: string; values: Array<string | number | boolean> }, dependencies: Dependencies = { resolve: resolvePostgresTarget, createClient: (config) => new Client(config) as unknown as ReadClient }) {
  const target = await dependencies.resolve(credential.host);
  const ca = postgresCaCertificates(credential.caCertificate);
  const client = dependencies.createClient({ host: target.address, port: credential.port, database: credential.database, user: credential.username, password: credential.password, ssl: { servername: target.servername, rejectUnauthorized: true, ...(ca ? { ca: [...rootCertificates, ...ca] } : {}) }, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, query_timeout: 15_000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const stream = client.query(new QueryStream(query.text, query.values, { batchSize: 1 }));
    const rows: Record<string, unknown>[] = [];
    let size = 0;
    for await (const row of stream) {
      const serialized = JSON.stringify(row);
      size += Buffer.byteLength(serialized);
      if (size > 200_000) { stream.destroy(); throw new NodeFailure("RESPONSE_TOO_LARGE", "PostgreSQL results exceed the output size limit.", false); }
      const safeRow = JSON.parse(serialized) as Record<string, unknown>;
      assertNoCredentialInProviderValue(safeRow, credential.password);
      rows.push(safeRow);
    }
    return { rows, count: rows.length };
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("POSTGRES_ERROR", "PostgreSQL read failed. Check the connection, permissions and selected table.", false);
  } finally { await client.end().catch(() => undefined); }
}

export async function listPostgresSchemas(credential: PostgresCredential) {
  const result = await readPostgresQuery(credential, { text: "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema' ORDER BY schema_name LIMIT 101", values: [] });
  return { schemas: result.rows.slice(0, 100).flatMap((row) => typeof row.name === "string" && /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(row.name) ? [{ id: row.name, name: row.name }] : []), hasMore: result.count > 100 };
}

export async function listPostgresTables(credential: PostgresCredential, schema: string) {
  // Reuse the identifier validation before sending a schema name to metadata discovery.
  buildPostgresSelect({ schema, table: "placeholder", columns: [], conditions: [], limit: 1 });
  const result = await readPostgresQuery(credential, { text: "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'VIEW') ORDER BY table_name LIMIT 101", values: [schema] });
  return { tables: result.rows.slice(0, 100).flatMap((row) => typeof row.name === "string" && /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(row.name) ? [{ id: row.name, name: row.name }] : []), hasMore: result.count > 100 };
}

export async function listPostgresColumns(credential: PostgresCredential, schema: string, table: string) {
  // Validate identifiers and bind metadata predicates; never interpolate user SQL.
  buildPostgresSelect({ schema, table, columns: [], conditions: [], limit: 1 });
  const result = await readPostgresQuery(credential, { text: "SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position LIMIT 101", values: [schema, table] });
  return { columns: result.rows.slice(0, 100).flatMap((row) => typeof row.name === "string" && /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(row.name) ? [{ id: row.name, name: row.name, type: typeof row.type === "string" ? row.type.slice(0, 100) : "" }] : []), hasMore: result.count > 100 };
}

const postgresConfigKeys = new Set(["credentialId", "schema", "table", "limit", "columns", "conditions", "orderBy", "orderDirection", "offset", "retryAttempts", "timeoutMs"]);
const postgresSelectionKeys = ["limit", "columns", "conditions", "orderBy", "orderDirection", "offset"] as const;

export async function executePostgresSelect(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: typeof readPostgresRows = readPostgresRows): Promise<{ status: "succeeded"; output: { rows: Record<string, unknown>[]; count: number; returnedCount?: number; page?: { limit: number; offset: number; completeness: "unknown" } }; route: "success" }> {
  if (Object.keys(config).some((key) => !postgresConfigKeys.has(key))) throw new NodeFailure("INVALID_INPUT", "PostgreSQL configuration contains an unsupported field.", false);
  requireResolvedSelection(config, postgresSelectionKeys, "PostgreSQL");
  const issue = nodeConfigIssues("action.postgres.select", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const schema = typeof config.schema === "string" ? config.schema : "";
  const table = typeof config.table === "string" ? config.table : "";
  const limit = Object.hasOwn(config, "limit") ? config.limit : 20;
  if (typeof limit !== "number") throw new NodeFailure("INVALID_INPUT", "Enter a valid row limit.", false);
  const columns = Object.hasOwn(config, "columns") ? config.columns : [];
  const conditions = Object.hasOwn(config, "conditions") ? config.conditions : [];
  const orderBy = config.orderBy === undefined || config.orderBy === "" ? undefined : config.orderBy;
  const orderDirection = config.orderDirection === undefined || config.orderDirection === "" ? undefined : config.orderDirection;
  const offset = Object.hasOwn(config, "offset") ? config.offset : 0;
  const selection = { columns, conditions, orderBy, orderDirection, offset } as PostgresSelection;
  buildPostgresSelect({ schema, table, limit, ...selection });
  const output = (result: { rows: Record<string, unknown>[]; count: number }) => ({ ...result, returnedCount: result.rows.length, page: { limit, offset: selection.offset ?? 0, completeness: "unknown" as const } });
  if (mode === "mock") return { status: "succeeded" as const, output: output({ rows: [{ example: true }], count: 1 }), route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a PostgreSQL connection.", false);
  const credential = validatePostgresCredential(await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.POSTGRES));
  return { status: "succeeded" as const, output: output(await read(credential, schema, table, limit, undefined, selection)), route: "success" as const };
}
