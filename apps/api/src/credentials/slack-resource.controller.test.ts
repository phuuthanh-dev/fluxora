import assert from "node:assert/strict";
import test from "node:test";
import { SlackResourceController } from "./slack-resource.controller";

test("Slack channel discovery requires workspace ownership and an owned Slack credential", async () => {
  const calls: string[] = [];
  const credential = { requireOwner: async (workspaceId: string, userId: string) => { calls.push(`owner:${workspaceId}:${userId}`); }, readForExecution: async (_id: string, workspaceId: string, provider: string) => { calls.push(`credential:${workspaceId}:${provider}`); return { accessToken: "synthetic" }; } };
  const controller = new SlackResourceController(credential as never);
  (controller as unknown as { listChannels: unknown }).listChannels = async (_token: string, cursor?: string) => ({ channels: [{ id: "C123", name: "#general" }], nextCursor: cursor ?? null });
  const result = await controller.channels("ws", "cred", { currentUser: { id: "owner" } } as never, "next");
  assert.deepEqual(calls, ["owner:ws:owner", "credential:ws:SLACK_OAUTH"]);
  assert.deepEqual(result, { channels: [{ id: "C123", name: "#general" }], nextCursor: "next" });
});
