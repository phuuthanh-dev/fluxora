import { lookup as dnsLookup, resolveSrv } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { CredentialProvider } from "@prisma/client";
import { BSON, MongoClient, MongoNetworkTimeoutError } from "mongodb";
import type { CredentialService } from "../credentials/credential.service";
import { isBlockedAddress } from "./outbound-url-policy";
import { NodeFailure } from "./node-failure";

type MongoConnection = { host: string; port: number; username: string; password: string; authDatabase: string; connectionMode?: "auto" | "direct" | "srv"; writeConcern?: "majority" | number; appName?: string };
type Document = Record<string, unknown>;

function readConnection(data: Record<string, unknown>): MongoConnection {
  if (data.configurationType !== undefined && !["values", "connectionString"].includes(String(data.configurationType))) throw new NodeFailure("CREDENTIAL_INVALID", "Choose a supported MongoDB configuration type.", false);
  if (data.configurationType === "connectionString") {
    try {
      if (typeof data.connectionString !== "string" || data.connectionString.length > 4096) throw new Error();
      const url = new URL(data.connectionString);
      if (!["mongodb:", "mongodb+srv:"].includes(url.protocol) || url.hash || !url.username || !url.password) throw new Error();
      const options = new Set<string>();
      for (const [key] of url.searchParams) {
        if (options.has(key) || !["authSource", "retryWrites", "w", "appName", "tls"].includes(key)) throw new Error();
        options.add(key);
      }
      const tls = url.searchParams.get("tls");
      const retryWrites = url.searchParams.get("retryWrites");
      if ((tls !== null && tls !== "true") || (retryWrites !== null && !["true", "false"].includes(retryWrites))) throw new Error();
      const w = url.searchParams.get("w");
      if (w !== null && w !== "majority" && !/^[1-9]\d{0,2}$/.test(w)) throw new Error();
      const appName = url.searchParams.get("appName");
      if (appName !== null && (!appName || appName.length > 128)) throw new Error();
      if (url.protocol === "mongodb+srv:" && url.port) throw new Error();
      const authDatabase = url.searchParams.get("authSource") || decodeURIComponent(url.pathname.slice(1)) || "admin";
      const connection = readConnection({ host: url.hostname, port: url.port ? Number(url.port) : 27017, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password), authDatabase, connectionMode: url.protocol === "mongodb+srv:" ? "srv" : "direct" });
      return { ...connection, ...(w === null ? {} : { writeConcern: w === "majority" ? "majority" : Number(w) }), ...(appName === null ? {} : { appName }) };
    } catch { throw new NodeFailure("CREDENTIAL_INVALID", "Invalid or unsupported MongoDB connection string. Use a single public host, TLS and supported options.", false); }
  }
  const host = typeof data.host === "string" ? data.host.trim().toLowerCase() : "";
  const port = data.port === undefined ? 27017 : data.port;
  const username = typeof data.username === "string" ? data.username : "";
  const password = typeof data.password === "string" ? data.password : "";
  const authDatabase = typeof data.authDatabase === "string" ? data.authDatabase : "admin";
  const connectionMode = data.connectionMode === undefined ? "auto" : data.connectionMode;
  if (!host || host.length > 253 || isIP(host) || host === "localhost" || host.endsWith(".localhost") || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host)
    || typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535
    || !username.trim() || username.length > 256 || !password || password.length > 1024
    || !validDatabase(authDatabase) || !["auto", "direct", "srv"].includes(String(connectionMode))) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a public MongoDB host, valid port, username, password and authentication database.", false);
  return { host, port, username, password, authDatabase, connectionMode: connectionMode as MongoConnection["connectionMode"] };
}

export function validateMongoCredential(data: Record<string, unknown>) { readConnection(data); }

function validDatabase(value: string) { return value.length > 0 && value.length <= 63 && !/[\\/. "$\0]/.test(value); }
function validCollection(value: string) { return value.length > 0 && value.length <= 120 && !/[\0$]/.test(value) && !value.startsWith("system."); }

/** Resolve and validate at socket connection time, avoiding DNS rebinding. */
export function guardedMongoLookup(resolve = dnsLookup): LookupFunction {
  return ((host: string, _options: unknown, callback: (error: Error | null, address: string, family: number) => void) => {
    if (isIP(host) || host === "localhost" || host.endsWith(".localhost")) return callback(new Error("MongoDB target is not permitted."), "", 0);
    void resolve(host, { all: true, verbatim: true }).then((results) => {
      if (!results.length || results.some((item) => isBlockedAddress(item.address))) return callback(new Error("MongoDB target is not permitted."), "", 0);
      const first = results[0]!;
      callback(null, first.address, first.family);
    }).catch(() => callback(new Error("MongoDB target could not be resolved."), "", 0));
  }) as LookupFunction;
}

export function createMongoClient(connection: MongoConnection, selectionTimeoutMs = 10_000) {
  // Direct TCP connection prevents discovery from bypassing guarded DNS lookup.
  // No connection-string options or filesystem paths come from the credential.
  return new MongoClient(`mongodb://${connection.host}:${connection.port}/`, {
    auth: { username: connection.username, password: connection.password },
    authSource: connection.authDatabase, tls: true, directConnection: true,
    lookup: guardedMongoLookup(), autoSelectFamily: false, retryWrites: false,
    ...(connection.writeConcern !== undefined ? { writeConcern: { w: connection.writeConcern } } : {}),
    ...(connection.appName ? { appName: connection.appName } : {}),
    maxPoolSize: 1, serverSelectionTimeoutMS: selectionTimeoutMs, connectTimeoutMS: selectionTimeoutMs, socketTimeoutMS: 20_000,
  });
}

type SrvRecord = { name: string; port: number; priority: number; weight: number };
type MongoClientFactory = (connection: MongoConnection) => MongoClient | Promise<MongoClient>;

async function boundedDns<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new NodeFailure("TIMEOUT", "MongoDB DNS lookup timed out.", true)), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Discover SRV seeds without letting topology discovery bypass guarded DNS. */
export async function createResolvedMongoClient(connection: MongoConnection, dependencies: {
  lookup: typeof dnsLookup;
  srv: typeof resolveSrv;
  client: typeof createMongoClient;
  dnsTimeoutMs?: number;
} = { lookup: dnsLookup, srv: resolveSrv, client: createMongoClient }): Promise<MongoClient> {
  if (connection.connectionMode === "direct") return dependencies.client(connection);
  if (connection.connectionMode !== "srv") {
    try {
      await boundedDns(dependencies.lookup(connection.host, { all: true, verbatim: true }), dependencies.dnsTimeoutMs ?? 4_000);
      return dependencies.client(connection);
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOTFOUND") throw error;
    }
  }
  const labels = connection.host.split(".");
  if (labels.length < 3) throw new NodeFailure("MONGODB_ERROR", "MongoDB SRV hostname is invalid.", false);
  const parent = labels.slice(1).join(".");
  const records: SrvRecord[] = await boundedDns(dependencies.srv(`_mongodb._tcp.${connection.host}`), dependencies.dnsTimeoutMs ?? 4_000);
  if (!records.length || records.length > 20) throw new NodeFailure("MONGODB_ERROR", "MongoDB SRV records are invalid.", false);
  const valid = records.every((record) => {
    const host = record.name.toLowerCase().replace(/\.$/, "");
    return host.endsWith(`.${parent}`) && host.length > parent.length + 1 && !isIP(host)
      && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host)
      && Number.isInteger(record.port) && record.port > 0 && record.port <= 65535;
  });
  if (!valid) throw new NodeFailure("MONGODB_ERROR", "MongoDB SRV records are invalid.", false);
  // Connect to at most three validated seeds directly. Never follow hosts from
  // server topology announcements; those can contain private IP literals.
  for (const seed of [...records].sort((a, b) => a.priority - b.priority).slice(0, 3)) {
    const client = dependencies.client({ ...connection, host: seed.name.toLowerCase().replace(/\.$/, ""), port: seed.port }, 4_000);
    try {
      await client.connect();
      const hello = await client.db("admin").command({ hello: 1 });
      if (hello.isWritablePrimary === true || hello.msg === "isdbgrid") return client;
    } catch { /* Try another seed only before sending any application operation. */ }
    await client.close().catch(() => undefined);
  }
  throw new NodeFailure("MONGODB_ERROR", "MongoDB could not connect to a writable SRV seed. Check network access and credentials.", false);
}

function validateFilter(value: unknown): Document {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { throw new NodeFailure("INVALID_INPUT", "Filter must be a JSON object.", false); } }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NodeFailure("INVALID_INPUT", "Filter must be a JSON object.", false);
  const encoded = JSON.stringify(value);
  if (encoded.length > 20_000) throw new NodeFailure("INVALID_INPUT", "Filter is too large.", false);
  const visit = (item: unknown, depth: number): void => {
    if (depth > 16) throw new NodeFailure("INVALID_INPUT", "Filter is nested too deeply.", false);
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["$where", "$function", "$accumulator"].includes(key)) throw new NodeFailure("INVALID_INPUT", "Server-side JavaScript is not supported in MongoDB filters.", false);
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return value as Document;
}

export async function executeMongoFind(config: Document, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, makeClient: MongoClientFactory = createResolvedMongoClient) {
  if (config.operation !== undefined && config.operation !== "find") throw new NodeFailure("INVALID_INPUT", "Only the Find documents operation is available.", false);
  const database = typeof config.database === "string" ? config.database : "";
  const collection = typeof config.collection === "string" ? config.collection : "";
  const limit = config.limit === undefined ? 20 : config.limit;
  const filter = validateFilter(config.filter ?? {});
  if (!validDatabase(database) || !validCollection(collection) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Enter a valid database, collection and limit between 1 and 100.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { documents: [{ _id: "mock-document", example: true }], count: 1 }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a MongoDB connection.", false);
  const connection = readConnection(await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.MONGODB));
  let client: MongoClient | undefined;
  try {
    client = await makeClient(connection);
    await client.connect();
    const cursor = client.db(database).collection(collection).find(filter, { maxTimeMS: 10_000 }).limit(limit).batchSize(1);
    const documents: unknown[] = [];
    let size = 0;
    for await (const document of cursor) {
      const value = BSON.EJSON.serialize(document, { relaxed: true });
      size += Buffer.byteLength(JSON.stringify(value));
      if (size > 200_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "MongoDB results exceed the output size limit.", false);
      documents.push(value);
    }
    return { status: "succeeded" as const, output: { documents, count: documents.length }, route: "success" as const };
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    if (error instanceof MongoNetworkTimeoutError) throw new NodeFailure("TIMEOUT", "MongoDB query timed out.", true);
    throw new NodeFailure("MONGODB_ERROR", "MongoDB query failed. Check the connection, permissions and query.", false);
  } finally { await client?.close().catch(() => undefined); }
}

export async function executeMongoInsert(config: Document, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, makeClient: MongoClientFactory = createResolvedMongoClient) {
  const database = typeof config.database === "string" ? config.database : "";
  const collection = typeof config.collection === "string" ? config.collection : "";
  let document: unknown = config.document;
  if (typeof document === "string") { try { document = JSON.parse(document); } catch { throw new NodeFailure("INVALID_INPUT", "Document must be a JSON object.", false); } }
  if (!validDatabase(database) || !validCollection(collection) || !document || typeof document !== "object" || Array.isArray(document) || Buffer.byteLength(JSON.stringify(document)) > 200_000) throw new NodeFailure("INVALID_INPUT", "Enter a valid database, collection and JSON document under 200 KB.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { inserted: true, insertedId: "mock-document" }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a MongoDB connection.", false);
  const connection = readConnection(await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.MONGODB));
  let client: MongoClient | undefined;
  try {
    client = await makeClient(connection);
    await client.connect();
    try {
      const result = await client.db(database).collection(collection).insertOne(document as Document, { timeoutMS: 10_000 });
      if (!result.acknowledged) throw new Error("Unacknowledged insert");
      return { status: "succeeded" as const, output: { inserted: true, insertedId: BSON.EJSON.serialize(result.insertedId, { relaxed: true }) }, route: "success" as const };
    } catch { throw new NodeFailure("WRITE_UNCERTAIN", "MongoDB did not confirm the insert. Check the collection before retrying.", false); }
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("MONGODB_ERROR", "MongoDB connection failed. Check the connection and permissions.", false);
  } finally { await client?.close().catch(() => undefined); }
}

export async function listMongoCollections(data: Document, database: string) {
  if (!validDatabase(database)) throw new NodeFailure("INVALID_INPUT", "Enter a valid database first.", false);
  const client = await createResolvedMongoClient(readConnection(data));
  try {
    await client.connect();
    const collections: Array<{ id: string; name: string }> = [];
    for await (const item of client.db(database).listCollections({}, { nameOnly: true, maxTimeMS: 10_000 })) {
      if (validCollection(item.name)) collections.push({ id: item.name, name: item.name });
      if (collections.length > 100) break;
    }
    return { collections: collections.slice(0, 100), hasMore: collections.length > 100 };
  } finally { await client.close().catch(() => undefined); }
}

export async function listMongoDatabases(data: Document) {
  const client = await createResolvedMongoClient(readConnection(data));
  try {
    await client.connect();
    const result = await client.db("admin").admin().listDatabases({ nameOnly: true, authorizedDatabases: true, maxTimeMS: 10_000 });
    const names = result.databases.filter((item) => validDatabase(item.name));
    return { databases: names.slice(0, 100).map((item) => ({ id: item.name, name: item.name })), hasMore: names.length > 100 };
  } finally { await client.close().catch(() => undefined); }
}
