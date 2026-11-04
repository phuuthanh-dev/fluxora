import assert from "node:assert/strict";
import test from "node:test";
import { getConnectorExecutor } from "./connector-executors";

const base = { credentialId: "synthetic", spreadsheetId: "sheet", range: "Sheet1!A1", values: [["=1+2"]] };

test("Sheets preserves legacy interpretation and supports explicit raw writes on v2", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; method: string; body: unknown }> = [];
  const reads: string[] = [];
  const credentials = { readGoogleForExecution: async (id: string, workspace: string) => { reads.push(`${workspace}:${id}`); return { accessToken: "synthetic-token" }; } } as never;
  const run = (type: string, config: Record<string, unknown>, mode: "mock" | "live" = "live") => getConnectorExecutor(type)!({ config, mode, workspaceId: "synthetic-workspace", credentials, executionId: "execution", nodeId: "node" });
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: new URL(String(url)), method: init?.method ?? "GET", body: init?.body }); return Response.json({ updatedCells: 1 }); }) as typeof fetch;
    await run("action.google-sheets", { ...base, operation: "append", valueInputOption: "RAW" });
    await run("action.google-sheets.v2", { ...base, operation: "append" });
    await run("action.google-sheets.v2", { ...base, operation: "append", valueInputOption: "RAW" });
    await run("action.google-sheets.v2", { ...base, operation: "update", valueInputOption: "RAW" });
    assert.deepEqual(calls.map(({ url, method }) => [method, url.searchParams.get("valueInputOption")]), [["POST", "USER_ENTERED"], ["POST", "USER_ENTERED"], ["POST", "RAW"], ["PUT", "RAW"]]);
    assert.deepEqual(JSON.parse(String(calls[2]!.body)), { values: [["=1+2"]] });
    assert.deepEqual(reads, Array(4).fill("synthetic-workspace:synthetic"));
    for (const option of [undefined, "", "INVALID", "{{$json.missing}}", null]) {
      await assert.rejects(() => run("action.google-sheets.v2", { ...base, operation: "append", valueInputOption: option }), /interpret values/);
      await assert.rejects(() => run("action.google-sheets.v2", { ...base, operation: "append", valueInputOption: option }, "mock"), /interpret values/);
    }
    assert.equal(reads.length, 4, "invalid input is rejected before reading the credential");
    assert.equal(calls.length, 4, "invalid input must not call Google");
  } finally { globalThis.fetch = originalFetch; }
});
