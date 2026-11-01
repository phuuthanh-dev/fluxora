import { Client, type ClientConfig } from "pg";
import QueryStream from "pg-query-stream";
import { NodeFailure } from "./node-failure";
import { buildPostgresSelect } from "./postgres-select-query";
import { resolvePostgresTarget } from "./postgres-target";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";

export type PostgresCredential = { host: string; port: number; database: string; username: string; password: string };

export function validatePostgresCredential(value: Record<string, unknown>): PostgresCredential {
  const { host, database, username, password, port } = value;
  if (typeof host !== "string" || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(host) || typeof database !== "string" || !database || database.length > 63 || /[\0\r\n]/.test(database) || typeof username !== "string" || !username || username.length > 256 || /[\0\r\n]/.test(username) || typeof password !== "string" || !password || password.length > 1024 || typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a PostgreSQL host, port, database, username and password.", false);
  return { host, port, database, username, password };
}

/** Read-only transaction, pinned DNS result, verified TLS and bounded streamed output. */
type ReadClient = { connect(): Promise<void>; query(sql: string): Promise<unknown>; query(query: QueryStream): QueryStream; end(): Promise<void> };
type Dependencies = { resolve: typeof resolvePostgresTarget; createClient: (config: ClientConfig) => ReadClient };

export async function readPostgresRows(credential: PostgresCredential, schema: string, table: string, limit: number, dependencies?: Dependencies) {
  return readPostgresQuery(credential, buildPostgresSelect({ schema, table, columns: [], conditions: [], limit }), dependencies);
}

async function readPostgresQuery(credential: PostgresCredential, query: { text: string; values: Array<string | number | boolean> }, dependencies: Dependencies = { resolve: resolvePostgresTarget, createClient: (config) => new Client(config) as unknown as ReadClient }) {
  const target = await dependencies.resolve(credential.host);
  const client = dependencies.createClient({ host: target.address, port: credential.port, database: credential.database, user: credential.username, password: credential.password, ssl: { servername: target.servername, rejectUnauthorized: true }, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, query_timeout: 15_000 });
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
      rows.push(JSON.parse(serialized) as Record<string, unknown>);
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

export async function executePostgresSelect(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: typeof readPostgresRows = readPostgresRows) {
  const schema = typeof config.schema === "string" ? config.schema : "";
  const table = typeof config.table === "string" ? config.table : "";
  const limit = config.limit === undefined ? 20 : config.limit;
  if (typeof limit !== "number") throw new NodeFailure("INVALID_INPUT", "Enter a valid row limit.", false);
  buildPostgresSelect({ schema, table, columns: [], conditions: [], limit });
  if (mode === "mock") return { status: "succeeded" as const, output: { rows: [{ example: true }], count: 1 }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a PostgreSQL connection.", false);
  const credential = validatePostgresCredential(await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.POSTGRES));
  return { status: "succeeded" as const, output: await read(credential, schema, table, limit), route: "success" as const };
}
