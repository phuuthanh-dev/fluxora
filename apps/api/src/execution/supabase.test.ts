import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeSupabaseSelect, listSupabaseColumns, listSupabaseTables } from "./supabase";
import { resolveExpressions } from "./expression";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SUPABASE);
  return { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_secret_fixture" };
} } as unknown as CredentialService;

test("Supabase refuses credential echoes in returned rows before truncation", async () => {
  const token = "eyJsynthetic.header.payload";
  const scoped = { readForExecution: async () => ({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_secret_fixture", userAccessToken: token }) } as unknown as CredentialService;
  const config = { credentialId: "connection", table: "items", limit: 1 };
  const unsafe = (secret: string, inKey: boolean) => async () => Response.json([{ id: 1 }, inKey ? { [secret]: "value" } : { nested: [{ note: `prefix ${secret} suffix` }] }]);
  {
    for (const secret of ["sb_secret_fixture", token]) {
      for (const inKey of [false, true]) {
        await assert.rejects(executeSupabaseSelect(config, "live", "workspace", scoped, unsafe(secret, inKey)), (error: unknown) => {
          const failure = error as { code: string; message: string; retryable: boolean };
          assert.equal(failure.code, "INVALID_RESPONSE");
          assert.equal(failure.retryable, false);
          assert.ok(!failure.message.includes(secret));
          return true;
        });
      }
    }
  }
  const safe = await executeSupabaseSelect(config, "live", "workspace", scoped, async () => Response.json([{ name: "safe" }]));
  assert.deepEqual(safe.output.rows, [{ name: "safe" }]);
});

test("Supabase discovery refuses echoed credentials in returned table and column names", async () => {
  for (const management of [false, true]) {
    const secret = management ? "sbp_synthetic_token" : "sb_publishable_fixture";
    const credential = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", ...(management ? { managementToken: secret } : {}) };
    await assert.rejects(listSupabaseTables(credential, async () => Response.json({ paths: { [`/${secret}`]: { get: {} } } })), { code: "INVALID_RESPONSE" });
    await assert.rejects(listSupabaseColumns(credential, "items", async () => Response.json({ paths: { "/items": { get: {} } }, definitions: { items: { properties: { [secret]: { type: "string" } } } } })), { code: "INVALID_RESPONSE" });
  }
});

test("Supabase precision guard is explicit and leaves older saved reads unchanged", async () => {
  const config = { credentialId: "connection", table: "items" };
  const unsafe = async () => new Response('[{"nested":{"id":9007199254740993}}]', { status: 200 });
  await assert.rejects(executeSupabaseSelect({ ...config, rejectUnsafeNumbers: true }, "live", "workspace", credentials, unsafe), (error: unknown) => {
    const failure = error as { code: string; message: string; retryable: boolean };
    assert.equal(failure.code, "UNSAFE_PROVIDER_NUMBER");
    assert.equal(failure.retryable, false);
    assert.ok(!failure.message.includes("9007199254740993"));
    return true;
  });
  const result = await executeSupabaseSelect(config, "live", "workspace", credentials, unsafe);
  assert.deepEqual(result.output.rows, [{ nested: { id: 9007199254740992 } }]);
  const safe = await executeSupabaseSelect({ ...config, rejectUnsafeNumbers: true }, "live", "workspace", credentials, async () => new Response('[{"id":"9007199254740993","fraction":0.1}]', { status: 200 }));
  assert.deepEqual(safe.output.rows, [{ id: "9007199254740993", fraction: 0.1 }]);
  await assert.rejects(executeSupabaseSelect({ ...config, rejectUnsafeNumbers: "true" }, "mock", "workspace", credentials), { code: "INVALID_INPUT" });
});

test("Supabase schema discovery returns safe table names and no functions", async () => {
  const result = await listSupabaseTables({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_secret_fixture" }, async (url, init) => {
    assert.equal(url, "https://abcdefghijklmnopqrst.supabase.co/rest/v1/");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.apikey, "sb_secret_fixture"); assert.equal(headers.authorization, undefined);
    return Response.json({ paths: { "/": { get: {} }, "/items": { get: {} }, "/rpc/change": { post: {} }, "/bad/name": { get: {} } } });
  });
  assert.deepEqual(result, { tables: [{ id: "items", name: "items" }], hasMore: false });
});

test("Supabase management discovery uses the scoped token only for the fixed schema endpoint", async () => {
  const data = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", managementToken: "sbp_synthetic_token" };
  const result = await listSupabaseTables(data, async (url, init) => {
    assert.equal(url, "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/openapi?schema=public");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer sbp_synthetic_token");
    assert.equal(headers.apikey, undefined);
    assert.ok(!url.includes(data.managementToken) && !url.includes(data.apiKey));
    return Response.json({ paths: { "/items": { get: {} }, "/rpc/hidden": { post: {} }, "/bad/name": { get: {} } } });
  });
  assert.deepEqual(result, { tables: [{ id: "items", name: "items" }], hasMore: false });
  const scoped = { readForExecution: async () => data } as unknown as CredentialService;
  await executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", scoped, async (url, init) => {
    assert.equal(url, "https://abcdefghijklmnopqrst.supabase.co/rest/v1/items?select=*&limit=20");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.apikey, data.apiKey);
    assert.equal(headers.authorization, undefined);
    return Response.json([]);
  });
});

test("Supabase management failures are bounded and do not fall back to elevated data keys", async () => {
  const data = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", managementToken: "sbp_synthetic_token" };
  for (const status of [401, 403]) {
    let calls = 0;
    await assert.rejects(listSupabaseTables(data, async () => {
      calls++;
      return Response.json({ message: "private provider response" }, { status });
    }), (error: unknown) => {
      const failure = error as { code: string; message: string };
      assert.equal(failure.code, "SUPABASE_MANAGEMENT_AUTH_FAILED");
      assert.ok(!failure.message.includes("private provider response") && !failure.message.includes(data.managementToken));
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(listSupabaseTables({ ...data, projectRef: "unsafe.example" }, async () => { throw new Error("must not fetch"); }), /project reference/);
  await assert.rejects(listSupabaseTables({ ...data, managementToken: "bad\r\nvalue" }, async () => { throw new Error("must not fetch"); }), /management token/);
  await assert.rejects(listSupabaseTables(data, async () => new Response("x".repeat(1_000_001), { status: 200 })), /size limit/);
});

test("Supabase column discovery returns only bounded metadata from the selected public table", async () => {
  const data = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", managementToken: "sbp_synthetic_token" };
  const result = await listSupabaseColumns(data, "items", async (url, init) => {
    assert.equal(url, "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/openapi?schema=public");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.authorization, `Bearer ${data.managementToken}`); assert.equal(headers.apikey, undefined);
    return Response.json({ paths: { "/items": { get: {} }, "/other": { get: {} } }, definitions: {
      items: { properties: { name: { type: "string", format: "text", description: "private metadata", default: "private default" }, id: { type: "integer", format: "bigint" } } },
      other: { properties: { hidden: { type: "string" } } },
    } });
  });
  assert.deepEqual(result, { columns: [{ name: "id", type: "bigint" }, { name: "name", type: "text" }], partial: false });
});

test("Supabase column discovery reports incomplete, unsafe and truncated metadata as partial", async () => {
  const data = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture" };
  const discover = (body: unknown) => listSupabaseColumns(data, "items", async (url, init) => {
    assert.equal(url, "https://abcdefghijklmnopqrst.supabase.co/rest/v1/");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.apikey, data.apiKey); assert.equal(headers.authorization, undefined);
    return Response.json(body);
  });
  for (const body of [{}, { paths: {}, definitions: { items: { properties: { id: { type: "integer" } } } } },
    { paths: { "/items": { get: {} } }, definitions: {} }, { paths: { "/items": { get: {} } }, definitions: { items: { $ref: "https://elsewhere.invalid/schema" } } }]) {
    assert.deepEqual(await discover(body), { columns: [], partial: true });
  }
  const incomplete = await discover({ paths: { "/items": { get: {} } }, definitions: { items: { properties: {
    safe: { type: "string", format: "secret provider detail" }, unknown: { format: "private detail" }, "bad,name": { type: "string" }, malformed: null,
  } } } });
  assert.deepEqual(incomplete, { columns: [{ name: "safe", type: "string" }, { name: "unknown", type: null }], partial: true });
  const properties = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`field_${String(i).padStart(2, "0")}`, { type: "string" }]));
  const truncated = await discover({ paths: { "/items": { get: {} } }, definitions: { items: { properties } } });
  assert.equal(truncated.columns.length, 50); assert.equal(truncated.partial, true);
  assert.equal(truncated.columns[0]?.name, "field_00"); assert.equal(truncated.columns[49]?.name, "field_49");
});

test("Supabase column discovery validates table and preserves unavailable-discovery errors", async () => {
  const data = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture" };
  for (const table of ["../items", "items?select=*", "items.column", ""]) {
    await assert.rejects(listSupabaseColumns(data, table, async () => { throw new Error("must not fetch"); }), (error: unknown) => {
      assert.equal((error as { code: string }).code, "INVALID_INPUT"); return true;
    });
  }
  let calls = 0;
  await assert.rejects(listSupabaseColumns(data, "items", async () => {
    calls++; return Response.json({ message: "Access to schema is forbidden", hint: "private" }, { status: 401 });
  }), (error: unknown) => {
    const failure = error as { code: string; message: string };
    assert.equal(failure.code, "SUPABASE_DISCOVERY_RESTRICTED"); assert.ok(!failure.message.includes("private")); return true;
  });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(listSupabaseColumns({ ...data, managementToken: "sbp_synthetic_token" }, "items", async () => {
    calls++; return Response.json({ message: "private provider detail" }, { status: 403 });
  }), (error: unknown) => {
    const failure = error as { code: string; message: string };
    assert.equal(failure.code, "SUPABASE_MANAGEMENT_AUTH_FAILED"); assert.ok(!failure.message.includes("private")); return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(listSupabaseColumns(data, "items", async () => new Response("x".repeat(1_000_001), { status: 200 })), /size limit/);
});

test("Supabase row read uses key header and bounded public table query", async () => {
  const result = await executeSupabaseSelect({ credentialId: "connection", table: "items", limit: 1 }, "live", "workspace", credentials, async (url, init) => {
    const parsed = new URL(url); assert.equal(parsed.pathname, "/rest/v1/items"); assert.equal(parsed.searchParams.get("limit"), "1");
    assert.equal((init.headers as Record<string, string>).apikey, "sb_secret_fixture");
    return Response.json([{ id: 1 }, { id: 2 }]);
  });
  assert.deepEqual(result.output, { rows: [{ id: 1 }], count: 1, returnedCount: 1, page: { limit: 1, offset: 0, completeness: "unknown" } });
  await assert.rejects(executeSupabaseSelect({ table: "../items" }, "mock", "workspace", credentials), /Choose a table/);
});

test("Supabase serializes structured selection, AND filters, ordering and one offset page", async () => {
  const data = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", managementToken: "sbp_synthetic_token" };
  const scoped = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
    assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SUPABASE);
    return data;
  } } as unknown as CredentialService;
  const tricky = "a&order=id.desc,other&select=*&or=(id.eq.1)";
  const result = await executeSupabaseSelect({ credentialId: "connection", table: "items", columns: ["id", "name"],
    filters: [{ column: "name", operator: "equals", value: tricky }, { column: "score", operator: "greaterThanOrEqual", value: 3 },
      { column: "score", operator: "lessThan", value: 9 }, { column: "active", operator: "equals", value: true },
      { column: "deleted_at", operator: "isNull" }, { column: "updated_at", operator: "isNotNull" }],
    order: [{ column: "score", direction: "desc", nulls: "last" }, { column: "id", direction: "asc", nulls: "first" }], limit: 2, offset: 10,
  }, "live", "workspace", scoped, async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://abcdefghijklmnopqrst.supabase.co");
    assert.equal(parsed.pathname, "/rest/v1/items");
    assert.deepEqual([...parsed.searchParams.keys()], ["select", "limit", "name", "score", "score", "active", "deleted_at", "updated_at", "order", "offset"]);
    assert.equal(parsed.searchParams.get("select"), "id,name");
    assert.equal(parsed.searchParams.get("name"), `eq.${tricky}`);
    assert.deepEqual(parsed.searchParams.getAll("score"), ["gte.3", "lt.9"]);
    assert.equal(parsed.searchParams.get("active"), "eq.true");
    assert.equal(parsed.searchParams.get("deleted_at"), "is.null");
    assert.equal(parsed.searchParams.get("updated_at"), "not.is.null");
    assert.equal(parsed.searchParams.get("order"), "score.desc.nullslast,id.asc.nullsfirst");
    assert.equal(parsed.searchParams.get("limit"), "2"); assert.equal(parsed.searchParams.get("offset"), "10");
    assert.equal(init.method, "GET");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.apikey, data.apiKey); assert.equal(headers.authorization, undefined);
    assert.ok(!url.includes(data.managementToken));
    return Response.json([{ id: 11 }, { id: 12 }, { id: 13 }]);
  });
  assert.deepEqual(result.output, { rows: [{ id: 11 }, { id: 12 }], count: 2, returnedCount: 2, page: { limit: 2, offset: 10, completeness: "unknown" } });
});

test("Supabase rejects malformed or unbounded query inputs before credential access in both modes", async () => {
  const badConfigs: Record<string, unknown>[] = [
    { filter: [] }, { colums: ["id"] }, { ordering: [] }, { offest: 1 }, { userAccessToken: "synthetic.token.value" },
    { columns: "id,name" }, { columns: ["*", "id"] }, { columns: ["id,other"] }, { columns: ["id(*)"] },
    { columns: Array(51).fill("id") }, { filters: {} }, { filters: Array(21).fill({ column: "id", operator: "equals", value: 1 }) },
    { filters: [{ column: "id&limit=100", operator: "equals", value: 1 }] },
    ...["select", "limit", "offset", "order", "or", "and", "not"].map((column) => ({ filters: [{ column, operator: "equals", value: 1 }] })),
    { filters: [{ column: "id", operator: "constructor", value: 1 }] }, { filters: [{ column: "id", operator: "in", value: [1] }] },
    { filters: [{ column: "id", operator: "equals", value: null }] }, { filters: [{ column: "id", operator: "equals", value: Infinity }] },
    { filters: [{ column: "id", operator: "equals", value: "a\nb" }] }, { filters: [{ column: "id", operator: "equals", value: "x".repeat(1001) }] },
    { filters: [{ column: "id", operator: "isNull", value: null }] }, { filters: [{ column: "id", operator: "equals", value: 1, raw: "or" }] },
    { order: "id.desc" }, { order: [{ column: "id.desc", direction: "asc" }] }, { order: [{ column: "id", direction: "desc,other.asc" }] },
    { order: [{ column: "id", direction: "asc", nulls: "anything" }] }, { order: Array(11).fill({ column: "id", direction: "asc" }) },
    ...[-1, 1.5, 1_000_001, "1", null].map((offset) => ({ offset })), { offset: 1 }, { offset: 1, order: [] },
    { filters: Array(10).fill({ column: "name", operator: "equals", value: "x".repeat(900) }) },
  ];
  const forbidden = { readForExecution: async () => { throw new Error("credential access is forbidden"); } } as unknown as CredentialService;
  for (const mode of ["mock", "live"] as const) {
    for (const config of badConfigs) {
      await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items", ...config }, mode, "workspace", forbidden, async () => { throw new Error("transport is forbidden"); }), (error: unknown) => {
        assert.equal((error as { code: string }).code, "INVALID_INPUT"); return true;
      });
    }
  }
});

test("Supabase selection rejects unsafe numeric identifiers before credential or network access", async () => {
  const forbidden = { readForExecution: async () => { throw new Error("unexpected credential read"); } } as unknown as CredentialService;
  for (const mode of ["mock", "live"] as const) {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
      await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items", filters: [{ column: "id", operator: "equals", value }] }, mode, "workspace", forbidden, async () => { throw new Error("unexpected provider request"); }), /Use text for large integer identifiers/);
    }
  }
  const exact = "9007199254740993";
  await executeSupabaseSelect({ credentialId: "connection", table: "items", filters: [{ column: "id", operator: "equals", value: exact }] }, "live", "workspace", credentials, async (url) => {
    assert.equal(new URL(url).searchParams.get("id"), `eq.${exact}`);
    return Response.json([]);
  });
});

test("Supabase accepts empty selections and all supported scalar comparison operators", async () => {
  await executeSupabaseSelect({ credentialId: "connection", table: "items", columns: [], filters: [
    { column: "a", operator: "notEquals", value: "" }, { column: "b", operator: "greaterThan", value: -1.5 },
    { column: "c", operator: "lessThanOrEqual", value: false },
  ], order: [], offset: 0 }, "live", "workspace", credentials, async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get("select"), "*"); assert.equal(params.get("limit"), "20"); assert.equal(params.get("offset"), "0");
    assert.equal(params.get("a"), "neq."); assert.equal(params.get("b"), "gt.-1.5"); assert.equal(params.get("c"), "lte.false");
    return Response.json([]);
  });
});

test("Supabase requires explicit ordering for a positive offset in mock and live modes", async () => {
  const forbidden = { readForExecution: async () => { throw new Error("must not read credential"); } } as unknown as CredentialService;
  for (const mode of ["mock", "live"] as const) {
    await assert.rejects(executeSupabaseSelect({ table: "items", offset: 1 }, mode, "workspace", forbidden), (error: unknown) => {
      const failure = error as { code: string; message: string };
      assert.equal(failure.code, "INVALID_INPUT"); assert.match(failure.message, /offset pagination requires an explicit order/); return true;
    });
  }
  const result = await executeSupabaseSelect({ table: "items", offset: 1, order: [{ column: "id", direction: "asc" }] }, "mock", "workspace", forbidden);
  assert.equal(result.status, "succeeded");
});

test("Supabase preserves saved and generic config fields, with explicitly uncertain page completeness", async () => {
  const mock = await executeSupabaseSelect({ credentialId: "connection", table: "items", limit: 2, retryAttempts: 3, timeoutMs: 9000 }, "mock", "workspace", credentials);
  assert.deepEqual(mock.output, { rows: [{ example: true }], count: 1, returnedCount: 1, page: { limit: 2, offset: 0, completeness: "unknown" } });
  for (const returned of [[], [{ id: 1 }], [{ id: 1 }, { id: 2 }]]) {
    const result = await executeSupabaseSelect({ credentialId: "connection", table: "items", limit: 2, retryAttempts: 3, timeoutMs: 9000 }, "live", "workspace", credentials, async () => Response.json(returned));
    assert.deepEqual(result.output, { rows: returned, count: returned.length, returnedCount: returned.length, page: { limit: 2, offset: 0, completeness: "unknown" } });
  }
});

test("Supabase uses an explicit user JWT with the API key and keeps management discovery separate", async () => {
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl";
  for (const apiKey of ["sb_publishable_fixture", "eyJfixture.legacy.key"]) {
    const data = { projectRef: "abcdefghijklmnopqrst", apiKey, userAccessToken: token, managementToken: "sbp_synthetic_token" };
    const scoped = { readForExecution: async () => data } as unknown as CredentialService;
    const result = await executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", scoped, async (url, init) => {
      const headers = init.headers as Record<string, string>;
      assert.equal(headers.apikey, apiKey); assert.equal(headers.authorization, `Bearer ${token}`);
      assert.ok(!url.includes(token)); assert.ok(!url.includes(data.managementToken));
      return Response.json([]);
    });
    assert.ok(!JSON.stringify(result).includes(token));
    await listSupabaseColumns(data, "items", async (url, init) => {
      assert.equal(url, "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/openapi?schema=public");
      const headers = init.headers as Record<string, string>;
      assert.equal(headers.authorization, `Bearer ${data.managementToken}`); assert.equal(headers.apikey, undefined);
      assert.ok(!JSON.stringify(headers).includes(token));
      return Response.json({ paths: { "/items": { get: {} } }, definitions: { items: { properties: { id: { type: "integer" } } } } });
    });
  }
  await listSupabaseTables({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", userAccessToken: token }, async (_url, init) => {
    assert.equal((init.headers as Record<string, string>).authorization, `Bearer ${token}`);
    return Response.json({ paths: {} });
  });
});

test("Supabase rejects malformed user JWTs without transport or token disclosure", async () => {
  for (const userAccessToken of [null, 12, "bad", "a.b.", "a.b.c.d", "a.b.c\r\nAuthorization: secret", "a.b." + "c".repeat(8193)]) {
    const scoped = { readForExecution: async () => ({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", userAccessToken }) } as unknown as CredentialService;
    await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", scoped, async () => { throw new Error("must not fetch"); }), (error: unknown) => {
      const failure = error as { code: string; message: string };
      assert.equal(failure.code, "CREDENTIAL_INVALID");
      if (typeof userAccessToken === "string") assert.ok(!failure.message.includes(userAccessToken));
      return true;
    });
  }
  const scoped = { readForExecution: async () => ({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", userAccessToken: "" }) } as unknown as CredentialService;
  await executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", scoped, async (_url, init) => {
    assert.equal((init.headers as Record<string, string>).authorization, undefined); return Response.json([]);
  });
});

test("Supabase errors do not return bearer or provider details", async () => {
  const token = "synthetic.header.signature";
  const scoped = { readForExecution: async () => ({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture", userAccessToken: token }) } as unknown as CredentialService;
  for (const status of [401, 403]) {
    await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", scoped, async () => Response.json({ message: token }, { status })), (error: unknown) => {
      const failure = error as { code: string; message: string; statusCode: number };
      assert.equal(failure.code, "HTTP_ERROR"); assert.equal(failure.statusCode, status);
      assert.ok(!failure.message.includes(token)); assert.match(failure.message, /key/); return true;
    });
  }
  await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", scoped, async () => { throw new Error(`private ${token}`); }), (error: unknown) => {
    const failure = error as { code: string; message: string }; assert.equal(failure.code, "NETWORK_ERROR"); assert.ok(!failure.message.includes(token)); return true;
  });
});

test("legacy JWT uses bearer authorization; invalid hosts and oversized data are rejected", async () => {
  await listSupabaseTables({ projectRef: "abcdefghijklmnopqrst", apiKey: "eyJfixture.abc.def" }, async (_url, init) => {
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer eyJfixture.abc.def");
    return Response.json({ paths: {} });
  });
  await assert.rejects(listSupabaseTables({ projectRef: "evil.example", apiKey: "fixture" }, async () => { throw new Error("must not fetch"); }), /project reference/);
  await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", credentials, async () => Response.json([{ body: "x".repeat(200_001) }])), /output size limit/);
});

test("Supabase recognizes restricted schema discovery without mislabeling an invalid key", async () => {
  const credential = { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_publishable_fixture" };
  await assert.rejects(listSupabaseTables(credential, async () => Response.json({ message: "Access to schema is forbidden", hint: "provider-only detail" }, { status: 401 })), (error: unknown) => {
    const failure = error as { code: string; message: string }; assert.equal(failure.code, "SUPABASE_DISCOVERY_RESTRICTED"); assert.ok(!failure.message.includes("provider-only detail")); return true;
  });
  await assert.rejects(listSupabaseTables(credential, async () => Response.json({ message: "Invalid API key" }, { status: 401 })), (error: unknown) => {
    assert.equal((error as { code: string }).code, "HTTP_ERROR"); return true;
  });
});

test("Supabase rejects unresolved selection expressions before mock or live provider access", async () => {
  let calls = 0;
  const forbidden = { readForExecution: async () => { calls++; throw new Error("unexpected credential read"); } } as unknown as CredentialService;
  const transport = async () => { calls++; throw new Error("unexpected provider request"); };
  for (const mode of ["mock", "live"] as const) {
    for (const key of ["columns", "filters", "order", "offset", "limit"]) {
      const config = resolveExpressions({ credentialId: "connection", table: "items", [key]: "{{ steps.missing.output }}" }, { steps: {} }) as Record<string, unknown>;
      assert.equal(Object.hasOwn(config, key), true);
      assert.equal(config[key], undefined);
      await assert.rejects(executeSupabaseSelect(config, mode, "workspace", forbidden, transport), /unresolved value/);
    }
    for (const nested of [
      { filters: [{ column: "id", operator: "equals", value: "{{ steps.missing.output }}" }] },
      { order: [{ column: "id", direction: "asc", nulls: "{{ steps.missing.output }}" }] },
      { columns: ["{{ steps.missing.output }}"] },
    ]) {
      const config = resolveExpressions({ credentialId: "connection", table: "items", ...nested }, { steps: {} }) as Record<string, unknown>;
      await assert.rejects(executeSupabaseSelect(config, mode, "workspace", forbidden, transport), /unresolved value/);
    }
  }
  assert.equal(calls, 0);
  const legacy = await executeSupabaseSelect({ table: "items", retryAttempts: 2, timeoutMs: 9000 }, "mock", "workspace", forbidden, transport);
  assert.deepEqual(legacy.output.page, { limit: 20, offset: 0, completeness: "unknown" });
});
