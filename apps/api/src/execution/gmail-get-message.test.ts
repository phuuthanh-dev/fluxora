import assert from "node:assert/strict";
import test from "node:test";
import { executeGmailGetMessage } from "./gmail-get-message";

test("Gmail get-message mock validates ID without accessing a connection", async () => {
  const credentials = { readGoogleForExecution: () => { throw new Error("mock accessed credentials"); } };
  const result = await executeGmailGetMessage({ messageId: "example-message" }, "mock", "workspace", credentials as never);
  assert.equal(result.output.message.id, "example-message");
  assert.equal(result.output.message.bodyStatus, "available");
  await assert.rejects(executeGmailGetMessage({ messageId: "../invalid" }, "mock", "workspace", credentials as never), /message ID/);
});
