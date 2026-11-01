import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { CredentialProvider } from "@prisma/client";
import { BSON, MongoClient, MongoNetworkTimeoutError } from "mongodb";
import type { CredentialService } from "../credentials/credential.service";
import { isBlockedAddress } from "./outbound-url-policy";
import { NodeFailure } from "./node-failure";

type MongoConnection = { host: string; port: number; username: string; password: string; authDatabase: string };
type Document = Record<string, unknown>;

function readConnection(data: Record<string, unknown>): MongoConnection {
  const host = typeof data.host === "string" ? data.host.trim().toLowerCase() : "";
  const port = data.port === undefined ? 27017 : data.port;
  const username = typeof data.username === "string" ? data.username : "";
  const password = typeof data.password === "string" ? data.password : "";
  const authDatabase = typeof data.authDatabase === "string" ? data.authDatabase : "admin";
  if (!host || host.length > 253 || isIP(host) || host === "localhost" || host.endsWith(".localhost") || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host)
    || typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535
    || !username.trim() || username.length > 256 || !password || password.length > 1024
    || !validDatabase(authDatabase)) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a public MongoDB host, valid port, username, password and authentication database.", false);
  return { host, port, username, password, authDatabase };
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

export function createMongoClient(connection: MongoConnection) {
  // Direct TCP connection prevents discovery from bypassing guarded DNS lookup.
  // No connection-string options or filesystem paths come from the credential.
  return new MongoClient(`mongodb://${connection.host}:${connection.port}/`, {
    auth: { username: connection.username, password: connection.password },
    authSource: connection.authDatabase, tls: true, directConnection: true,
    lookup: guardedMongoLookup(), autoSelectFamily: false, retryWrites: false,
    maxPoolSize: 1, serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000, socketTimeoutMS: 20_000,
  });
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

export async function executeMongoFind(config: Document, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, makeClient: typeof createMongoClient = createMongoClient) {
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
  const client = makeClient(connection);
  try {
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
  } finally { await client.close().catch(() => undefined); }
}

export async function executeMongoInsert(config: Document, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, makeClient: typeof createMongoClient = createMongoClient) {
  const database = typeof config.database === "string" ? config.database : "";
  const collection = typeof config.collection === "string" ? config.collection : "";
  let document: unknown = config.document;
  if (typeof document === "string") { try { document = JSON.parse(document); } catch { throw new NodeFailure("INVALID_INPUT", "Document must be a JSON object.", false); } }
  if (!validDatabase(database) || !validCollection(collection) || !document || typeof document !== "object" || Array.isArray(document) || Buffer.byteLength(JSON.stringify(document)) > 200_000) throw new NodeFailure("INVALID_INPUT", "Enter a valid database, collection and JSON document under 200 KB.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { inserted: true, insertedId: "mock-document" }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a MongoDB connection.", false);
  const connection = readConnection(await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.MONGODB));
  const client = makeClient(connection);
  try {
    await client.connect();
    try {
      const result = await client.db(database).collection(collection).insertOne(document as Document, { timeoutMS: 10_000 });
      if (!result.acknowledged) throw new Error("Unacknowledged insert");
      return { status: "succeeded" as const, output: { inserted: true, insertedId: BSON.EJSON.serialize(result.insertedId, { relaxed: true }) }, route: "success" as const };
    } catch { throw new NodeFailure("WRITE_UNCERTAIN", "MongoDB did not confirm the insert. Check the collection before retrying.", false); }
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("MONGODB_ERROR", "MongoDB connection failed. Check the connection and permissions.", false);
  } finally { await client.close().catch(() => undefined); }
}

export async function listMongoCollections(data: Document, database: string) {
  if (!validDatabase(database)) throw new NodeFailure("INVALID_INPUT", "Enter a valid database first.", false);
  const client = createMongoClient(readConnection(data));
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
  const client = createMongoClient(readConnection(data));
  try {
    await client.connect();
    const result = await client.db("admin").admin().listDatabases({ nameOnly: true, authorizedDatabases: true, maxTimeMS: 10_000 });
    const names = result.databases.filter((item) => validDatabase(item.name));
    return { databases: names.slice(0, 100).map((item) => ({ id: item.name, name: item.name })), hasMore: names.length > 100 };
  } finally { await client.close().catch(() => undefined); }
}
