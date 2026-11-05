import assert from "node:assert/strict";
import test from "node:test";
import { getConnectorExecutor } from "./connector-executors";

const base = { credentialId: "synthetic", spreadsheetId: "sheet", range: "Sheet1!A1", values: [["=1+2"]] };

test("Sheets supports default and explicit raw writes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; method: string; body: unknown }> = [];
  const reads: string[] = [];
  const credentials = { readGoogleForExecution: async (id: string, workspace: string) => { reads.push(`${workspace}:${id}`); return { accessToken: "synthetic-token" }; } } as never;
  const run = (type: string, config: Record<string, unknown>, mode: "mock" | "live" = "live") => getConnectorExecutor(type)!({ config, mode, workspaceId: "synthetic-workspace", credentials, executionId: "execution", nodeId: "node" });
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: new URL(String(url)), method: init?.method ?? "GET", body: init?.body }); return Response.json({ updatedCells: 1 }); }) as typeof fetch;
    await run("action.google-sheets", { ...base, operation: "append" });
    await run("action.google-sheets", { ...base, operation: "append", valueInputOption: "RAW" });
    await run("action.google-sheets", { ...base, operation: "update", valueInputOption: "RAW" });
    assert.deepEqual(calls.map(({ url, method }) => [method, url.searchParams.get("valueInputOption")]), [["POST", "USER_ENTERED"], ["POST", "RAW"], ["PUT", "RAW"]]);
    assert.deepEqual(JSON.parse(String(calls[1]!.body)), { values: [["=1+2"]] });
    assert.deepEqual(reads, Array(3).fill("synthetic-workspace:synthetic"));
    for (const option of [undefined, "", "INVALID", "{{$json.missing}}", null]) {
      await assert.rejects(() => run("action.google-sheets", { ...base, operation: "append", valueInputOption: option }), /interpret values/);
      await assert.rejects(() => run("action.google-sheets", { ...base, operation: "append", valueInputOption: option }, "mock"), /interpret values/);
    }
    assert.equal(reads.length, 3, "invalid input is rejected before reading the credential");
    assert.equal(calls.length, 3, "invalid input must not call Google");
  } finally { globalThis.fetch = originalFetch; }
});

test("Sheets mock checks write values and a provided range without a connection", async () => {
  const execute = getConnectorExecutor("action.google-sheets")!;
  const credentials = { readGoogleForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  const run = (config: Record<string, unknown>) => execute({ config, mode: "mock", workspaceId: "workspace", credentials, executionId: "execution", nodeId: "sheet" });
  for (const values of [undefined, "text", ["not a row"]]) await assert.rejects(run({ operation: "append", range: "A1", values }), /table/);
  await assert.rejects(run({ operation: "read", range: "" }), /range is required/);
  assert.equal((await run({ operation: "read", range: "A1" })).status, "succeeded");
});

test("Sheets mock write responses match the live provider response shape", async () => {
  const originalFetch = globalThis.fetch;
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) } as never;
  const updates = { spreadsheetId: "sheet", updatedRange: "Sheet1!A1", updatedRows: 1, updatedColumns: 2, updatedCells: 2 };
  try {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => Response.json(init?.method === "POST" ? { spreadsheetId: "sheet", tableRange: "", updates } : updates)) as typeof fetch;
    for (const operation of ["append", "update"] as const) {
      const config = { ...base, values: [["first", "second"]], operation };
      const run = (mode: "mock" | "live") => getConnectorExecutor("action.google-sheets")!({ config, mode, workspaceId: "workspace", credentials, executionId: "execution", nodeId: "node" });
      const mock = await run("mock");
      const live = await run("live");
      assert.deepEqual(mock.output, live.output);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("Sheets mock write counts reflect the supplied sample rows", async () => {
  const execute = getConnectorExecutor("action.google-sheets")!;
  const credentials = { readGoogleForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  for (const operation of ["append", "update"] as const) {
    const result = await execute({ config: { operation, range: "A1", values: [["one"], ["two", "three"]] }, mode: "mock", workspaceId: "workspace", credentials, executionId: "execution", nodeId: "sheet" });
    const updates = operation === "append" ? result.output.updates : result.output;
    assert.deepEqual(updates, { spreadsheetId: "mock-spreadsheet", updatedRange: "A1", updatedRows: 2, updatedColumns: 2, updatedCells: 3, ...(operation === "update" ? { operation } : {}) });
  }
});
