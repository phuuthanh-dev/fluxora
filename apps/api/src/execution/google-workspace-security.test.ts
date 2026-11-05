import assert from "node:assert/strict";
import test from "node:test";
import { executeGoogleDrive, executeGoogleSheets } from "./google-workspace-adapter";
import { isRetryableFailure } from "./retry-policy";

const token = "fixture-google-access-token";
const credential = { accessToken: token };
const failure = (code: string) => (error: unknown) => {
  const result = error as { code: string; retryable: boolean; message: string };
  assert.equal(result.code, code);
  assert.equal(result.retryable, false);
  assert.equal(isRetryableFailure(result), false);
  assert.ok(!result.message.includes(token));
  return true;
};

test("Drive rejects credential echoes in text, file lists and nested provider fields", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(`file ${token}`)) as typeof fetch;
    await assert.rejects(executeGoogleDrive(credential, { operation: "downloadText", fileId: "file-1" }, false), failure("INVALID_RESPONSE"));
    for (const paginated of [false, true]) {
      globalThis.fetch = (async () => Response.json({ files: [{ id: "file-1", name: `Report ${token}` }] })) as typeof fetch;
      await assert.rejects(executeGoogleDrive(credential, { operation: "list" }, paginated), failure("INVALID_RESPONSE"));
      globalThis.fetch = (async () => Response.json({ files: [{ [token]: "hidden in a key" }] })) as typeof fetch;
      await assert.rejects(executeGoogleDrive(credential, { operation: "list" }, paginated), failure("INVALID_RESPONSE"));
    }
  } finally { globalThis.fetch = previous; }
});

test("Drive and Sheets writes with unsafe output are uncertain and cannot be retried automatically", async () => {
  const previous = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ id: "file-1", name: token }); }) as typeof fetch;
    await assert.rejects(executeGoogleDrive(credential, { operation: "uploadText", name: "Report", text: "content" }, true), failure("DELIVERY_UNCERTAIN"));
    assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ updates: { updatedRange: token } }); }) as typeof fetch;
    await assert.rejects(executeGoogleSheets(credential, { operation: "append", spreadsheetId: "sheet-1", range: "Sheet1!A1", values: [["sample"]] }), failure("DELIVERY_UNCERTAIN"));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});

test("Sheets reads reject credential echoes inside cell data", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ range: "Sheet1!A1", values: [[`cell ${token}`]] })) as typeof fetch;
    await assert.rejects(executeGoogleSheets(credential, { operation: "read", spreadsheetId: "sheet-1", range: "Sheet1!A1" }), failure("INVALID_RESPONSE"));
  } finally { globalThis.fetch = previous; }
});
