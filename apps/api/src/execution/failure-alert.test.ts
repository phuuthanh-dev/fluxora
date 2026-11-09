import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionService } from "./execution.service";
import { defaultNotificationDispatcher } from "../notifications";

function fixture(mode = "LIVE", provider: string | null = "telegram") {
  let claimed = false;
  const sent: unknown[] = [];
  const db = { execution: {
    updateMany: async () => { if (claimed || mode !== "LIVE" || !provider) return { count: 0 }; claimed = true; return { count: 1 }; },
    findUnique: async () => ({ id: "run-1", mode, errorCode: "HTTP_ERROR", errorMessage: "secret provider response", completedAt: new Date("2026-11-09T00:00:00Z"), nodeExecutions: [{ nodeId: "node-1" }], workflowVersion: { workflow: { id: "wf-1", workspaceId: "ws-1", name: "My workflow", failureAlertProvider: provider, failureAlertCredentialId: "cred-1", failureAlertChatId: "123" } } }),
  } };
  const credentials = { readForExecution: async () => ({ botToken: "sensitive-test-token" }) };
  const service = new ExecutionService(db as never, credentials as never, { publish() {} } as never);
  return { service: service as unknown as { sendFailureAlert(id: string): Promise<void> }, sent };
}

test("failure alerts are minimal and claimed once per live execution", async () => {
  const f = fixture();
  const original = defaultNotificationDispatcher.dispatch;
  try {
    defaultNotificationDispatcher.dispatch = async (payload) => { f.sent.push(payload); return { delivered: true, provider: payload.provider, destination: "test", sentAt: "", mode: "live" }; };
    await f.service.sendFailureAlert("run-1");
    await f.service.sendFailureAlert("run-1");
    assert.equal(f.sent.length, 1);
    const text = JSON.stringify(f.sent[0]);
    assert.match(text, /My workflow/); assert.match(text, /HTTP_ERROR/); assert.match(text, /execution=run-1/);
    assert.ok(!text.includes("sensitive-test-token")); assert.ok(!text.includes("secret provider response"));
    const mock = fixture("MOCK"); await mock.service.sendFailureAlert("run-1"); assert.equal(mock.sent.length, 0);
    const off = fixture("LIVE", null); await off.service.sendFailureAlert("run-1"); assert.equal(off.sent.length, 0);
  } finally { defaultNotificationDispatcher.dispatch = original; }
});
