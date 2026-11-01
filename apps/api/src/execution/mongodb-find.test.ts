import assert from "node:assert/strict";
import test from "node:test";
import { createMongoClient, createResolvedMongoClient, executeMongoFind, executeMongoInsert, guardedMongoLookup, validateMongoCredential } from "./mongodb-find";

const connection = { host: "mongo.example.com", port: 27017, username: "test-user", password: "synthetic-password", authDatabase: "admin" };
const config = { database: "sample", collection: "items", filter: "{}", limit: 20 };

test("MongoDB mock validates input and never reads credentials", async () => {
  const result = await executeMongoFind(config, "mock", "workspace", { readForExecution: () => { throw new Error("unexpected credential read"); } } as never);
  assert.equal(result.output.count, 1);
  for (const invalid of [{ ...config, operation: "delete" }, { ...config, limit: 101 }, { ...config, filter: '{"$where":"return true"}' }, { ...config, filter: "[]" }]) {
    await assert.rejects(executeMongoFind(invalid, "mock", "workspace", {} as never));
  }
});

test("MongoDB credentials require a hostname and bounded safe fields", () => {
  validateMongoCredential(connection);
  for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "/tmp/mongodb.sock", "mongodb+srv://host.example.com"]) {
    assert.throws(() => validateMongoCredential({ ...connection, host }));
  }
  assert.throws(() => validateMongoCredential({ ...connection, port: 65536 }));
});

test("MongoDB connection strings accept supported TLS options and reject unsupported or unsafe variants", () => {
  validateMongoCredential({ configurationType: "connectionString", connectionString: "mongodb+srv://user:synthetic%40password@cluster.example.com/?retryWrites=true&w=majority&appName=Fluxora" });
  for (const connectionString of ["mongodb://user:secret@127.0.0.1/", "mongodb://user:secret@mongo.example.com/?tls=false", "mongodb+srv://user:secret@cluster.example.com/?replicaSet=other", "mongodb://user:secret@mongo.example.com/?w=0", "mongodb+srv://user:secret@cluster.example.com:1234/"]) {
    assert.throws(() => validateMongoCredential({ configurationType: "connectionString", connectionString }), (error: unknown) => error instanceof Error && !error.message.includes("secret"));
  }
});

test("MongoDB string credentials normalize into guarded driver settings without exposing the string", async () => {
  let seen: Record<string, unknown> | undefined;
  const cursor = { limit() { return this; }, batchSize() { return this; }, async *[Symbol.asyncIterator]() {} };
  const client = { connect: async () => {}, close: async () => {}, db: () => ({ collection: () => ({ find: () => cursor }) }) };
  const credentials = { readForExecution: async () => ({ configurationType: "connectionString", connectionString: "mongodb+srv://user:synthetic%40password@cluster.example.com/?authSource=admin&retryWrites=true&w=majority&appName=Fluxora" }) };
  const result = await executeMongoFind({ ...config, credentialId: "mongo" }, "live", "workspace", credentials as never, ((data: Record<string, unknown>) => { seen = data; return client; }) as never);
  assert.equal(seen?.host, "cluster.example.com");
  assert.equal(seen?.connectionMode, "srv");
  assert.equal(seen?.writeConcern, "majority");
  assert.equal(seen?.appName, "Fluxora");
  assert.ok(!JSON.stringify(result).includes("synthetic"));
});

test("MongoDB driver uses direct TLS, guarded DNS and disables implicit write retries", async () => {
  const client = createMongoClient(connection);
  assert.equal(client.options.directConnection, true);
  assert.equal(client.options.tls, true);
  assert.equal(client.options.retryWrites, false);
  assert.equal(typeof client.options.lookup, "function");
  await client.close();
});

test("MongoDB DNS guard rejects mixed private and public resolutions", async () => {
  const check = (addresses: Array<{ address: string; family: number }>) => new Promise<{ error: Error | null; address: string }>((resolve) => {
    const resolver = (async () => addresses) as never;
    const lookup = guardedMongoLookup(resolver);
    lookup("mongo.example.com", { family: 0 }, (error, address) => resolve({ error, address: address as string }));
  });
  const allowed = await check([{ address: "8.8.8.8", family: 4 }]);
  assert.equal(allowed.error, null);
  assert.equal(allowed.address, "8.8.8.8");
  assert.ok((await check([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }])).error);
  assert.ok((await check([{ address: "169.254.169.254", family: 4 }])).error);
});

test("MongoDB retains direct hosts and does not mask transient DNS failures", async () => {
  const direct = createMongoClient(connection);
  const dependencies = { lookup: async () => [{ address: "8.8.8.8", family: 4 }], srv: () => { throw new Error("unexpected SRV lookup"); }, client: () => direct };
  assert.equal(await createResolvedMongoClient(connection, dependencies as never), direct);
  await direct.close();
  await assert.rejects(createResolvedMongoClient(connection, { ...dependencies, lookup: async () => { throw Object.assign(new Error("dns"), { code: "EAI_AGAIN" }); } } as never));
});

test("MongoDB bounds stalled DNS requests without trying another target", async () => {
  const dependencies = { lookup: () => new Promise(() => {}), srv: () => { throw new Error("unexpected SRV lookup"); }, client: () => { throw new Error("unexpected connection"); }, dnsTimeoutMs: 10 };
  await assert.rejects(createResolvedMongoClient(connection, dependencies as never), (error: unknown) => error instanceof Error && error.message === "MongoDB DNS lookup timed out." && "retryable" in error && error.retryable === true);
});

test("MongoDB SRV selects a writable guarded direct seed and closes non-primary seeds", async () => {
  const calls: Array<{ host: string; port: number }> = [];
  let closedSecondary = false;
  const secondary = { connect: async () => {}, close: async () => { closedSecondary = true; }, db: () => ({ command: async () => ({ isWritablePrimary: false }) }) };
  const primary = { connect: async () => {}, close: async () => {}, db: () => ({ command: async () => ({ isWritablePrimary: true }) }) };
  const dependencies = {
    lookup: async () => { throw Object.assign(new Error("dns"), { code: "ENOTFOUND" }); },
    srv: async (name: string) => { assert.equal(name, "_mongodb._tcp.cluster.example.com"); return [{ name: "node1.example.com", port: 27017, priority: 0, weight: 1 }, { name: "node2.example.com", port: 27018, priority: 0, weight: 1 }]; },
    client: (value: typeof connection, timeout: number) => { assert.equal(timeout, 4000); calls.push({ host: value.host, port: value.port }); return calls.length === 1 ? secondary : primary; },
  };
  const result = await createResolvedMongoClient({ ...connection, host: "cluster.example.com" }, dependencies as never);
  assert.equal(result, primary);
  assert.equal(closedSecondary, true);
  assert.deepEqual(calls, [{ host: "node1.example.com", port: 27017 }, { host: "node2.example.com", port: 27018 }]);
});

test("Explicit SRV mode uses SRV records without treating the cluster as a direct host", async () => {
  const primary = { connect: async () => {}, close: async () => {}, db: () => ({ command: async () => ({ isWritablePrimary: true }) }) };
  const dependencies = { lookup: () => { throw new Error("unexpected A lookup"); }, srv: async () => [{ name: "node.example.com", port: 27017, priority: 0, weight: 1 }], client: () => primary };
  assert.equal(await createResolvedMongoClient({ ...connection, host: "cluster.example.com", connectionMode: "srv" }, dependencies as never), primary);
});

test("MongoDB SRV rejects untrusted names and IP literals before creating a client", async () => {
  for (const target of ["internal.other.com", "127.0.0.1", "example.com", "node.example.com.evil.test"]) {
    const dependencies = { lookup: async () => { throw Object.assign(new Error("dns"), { code: "ENOTFOUND" }); }, srv: async () => [{ name: target, port: 27017, priority: 0, weight: 0 }], client: () => { throw new Error("unexpected connection"); } };
    await assert.rejects(createResolvedMongoClient({ ...connection, host: "cluster.example.com" }, dependencies as never), (error: unknown) => error instanceof Error && error.message === "MongoDB SRV records are invalid.");
  }
});

test("MongoDB live find uses workspace credential, bounded query and closes the client", async () => {
  let closed = false;
  let query: unknown;
  let limit = 0;
  const cursor = { limit(value: number) { limit = value; return this; }, batchSize() { return this; }, async *[Symbol.asyncIterator]() { yield { value: "example" }; } };
  const client = { connect: async () => {}, close: async () => { closed = true; }, db: (name: string) => { assert.equal(name, "sample"); return { collection: (name: string) => { assert.equal(name, "items"); return { find: (filter: unknown) => { query = filter; return cursor; } }; } }; } };
  const credentials = { readForExecution: async (...args: unknown[]) => { assert.deepEqual(args, ["mongo-credential", "workspace", "MONGODB"]); return connection; } };
  const result = await executeMongoFind({ ...config, credentialId: "mongo-credential", filter: '{"active":true}' }, "live", "workspace", credentials as never, (() => client) as never);
  assert.deepEqual(query, { active: true });
  assert.equal(limit, 20);
  assert.deepEqual(result.output.documents, [{ value: "example" }]);
  assert.equal(closed, true);
  assert.ok(!JSON.stringify(result).includes("synthetic-password"));
});

test("MongoDB failures are sanitized and connection is closed", async () => {
  let closed = false;
  const credentials = { readForExecution: async () => connection };
  const client = { connect: async () => { throw new Error("synthetic-password"); }, close: async () => { closed = true; } };
  await assert.rejects(executeMongoFind({ ...config, credentialId: "mongo-credential" }, "live", "workspace", credentials as never, (() => client) as never), (error: unknown) => error instanceof Error && !error.message.includes("synthetic-password"));
  assert.equal(closed, true);
});

test("MongoDB insert validates input and mock does not read credentials", async () => {
  const insert = { database: "sample", collection: "items", document: '{"name":"example"}' };
  const result = await executeMongoInsert(insert, "mock", "workspace", { readForExecution: () => { throw new Error("unexpected credential read"); } } as never);
  assert.equal(result.output.inserted, true);
  await assert.rejects(executeMongoInsert({ ...insert, document: "[]" }, "mock", "workspace", {} as never));
  await assert.rejects(executeMongoInsert({ ...insert, document: "{" }, "mock", "workspace", {} as never));
});

test("MongoDB insert sanitizes uncertain writes and never automatically retries", async () => {
  const credentials = { readForExecution: async (...args: unknown[]) => { assert.deepEqual(args, ["mongo", "workspace", "MONGODB"]); return connection; } };
  let closed = false;
  let inserted: unknown;
  const client = { connect: async () => {}, close: async () => { closed = true; }, db: () => ({ collection: () => ({ insertOne: async (doc: unknown) => { inserted = doc; return { acknowledged: true, insertedId: "new-id" }; } }) }) };
  const config = { credentialId: "mongo", database: "sample", collection: "items", document: '{"name":"example"}' };
  const result = await executeMongoInsert(config, "live", "workspace", credentials as never, (() => client) as never);
  assert.deepEqual(inserted, { name: "example" });
  assert.equal(result.output.insertedId, "new-id");
  assert.equal(closed, true);
  const uncertain = { ...client, db: () => ({ collection: () => ({ insertOne: async () => { throw new Error("synthetic-password"); } }) }) };
  await assert.rejects(executeMongoInsert(config, "live", "workspace", credentials as never, (() => uncertain) as never), (error: unknown) => error instanceof Error && !error.message.includes("synthetic-password") && "retryable" in error && error.retryable === false);
});
