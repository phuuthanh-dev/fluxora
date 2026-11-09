import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowService } from "./workflow.service";

test("failure alert settings require a workspace-owned connection of the right kind", async () => {
  const record = { id: "wf", workspaceId: "ws", failureAlertProvider: null as string | null, failureAlertCredentialId: null as string | null, failureAlertChatId: null as string | null };
  let credentialProvider = "TELEGRAM_BOT";
  const tx = { $queryRaw: async () => [{ provider: credentialProvider }], workflow: { update: async ({ data }: { data: typeof record }) => Object.assign(record, data) }, auditLog: { create: async () => ({}) } };
  const db = { workflow: { findFirst: async () => record }, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) };
  const service = new WorkflowService(db as never, {} as never);
  await assert.rejects(() => service.updateFailureAlert("wf", "owner", { provider: "telegram", credentialId: "c", chatId: "abc" }));
  await assert.rejects(() => service.updateFailureAlert("wf", "owner", { provider: "google_chat", credentialId: "c" }));
  await service.updateFailureAlert("wf", "owner", { provider: "telegram", credentialId: "c", chatId: "123" });
  assert.equal(record.failureAlertCredentialId, "c"); assert.equal(record.failureAlertChatId, "123");
  credentialProvider = "GOOGLE_CHAT_WEBHOOK";
  await service.updateFailureAlert("wf", "owner", { provider: "google_chat", credentialId: "chat" });
  assert.equal(record.failureAlertChatId, null);
  await service.updateFailureAlert("wf", "owner", { provider: null });
  assert.equal(record.failureAlertProvider, null); assert.equal(record.failureAlertCredentialId, null);
});
