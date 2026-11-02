import assert from "node:assert/strict";
import test from "node:test";
import { executeGmailWrite } from "./gmail-write";
import { NodeFailure } from "./node-failure";

test("Gmail mock actions validate fields and never access real credentials", async () => {
  const credentials = { readGoogleForExecution: () => { throw new Error("mock must not read credentials"); } };
  const mail = { to: "a@example.test, b@example.test", cc: "", bcc: "", subject: "Hello", text: "Example" };
  for (const operation of ["send", "draft", "updateDraft", "reply"] as const) {
    const output = await executeGmailWrite({ ...mail, messageId: "message-1", draftId: "draft-1" }, operation, "mock", "workspace", credentials as never);
    assert.equal(output.status, "succeeded");
    assert.equal(output.output.simulated, true);
  }
  const label = await executeGmailWrite({ messageId: "message-1", labelId: "Label_1", labelAction: "add" }, "label", "mock", "workspace", credentials as never);
  assert.deepEqual(label.output.result, { id: "message-1", labels: ["Label_1"] });
  await assert.rejects(executeGmailWrite({ ...mail, to: "a@example.test\r\nBcc: injected@example.test" }, "send", "mock", "workspace", credentials as never), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
  await assert.rejects(executeGmailWrite({ messageId: "../bad", labelId: "Label_1", labelAction: "add" }, "label", "mock", "workspace", credentials as never), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
});
