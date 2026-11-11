import assert from "node:assert/strict";
import test from "node:test";
import { providerPollTargets } from "./provider-poll-target";

test("provider polling scopes a checkpoint to its connection, resource and event", () => {
  const config = { credentialId: "connection", resourceId: "folder", resourceType: "folder", event: "created", pollMinutes: "5" };
  const graph = (changes: Record<string, unknown> = {}) => ({ nodes: [{ id: "trigger", type: "trigger.google-drive.file" as const, position: { x: 0, y: 0 }, config: { ...config, ...changes } }], edges: [] });
  const target = (changes?: Record<string, unknown>) => providerPollTargets("flow", "version", "workspace", graph(changes))[0]!;
  assert.equal(target().configHash, target({ pollMinutes: "15" }).configHash);
  assert.notEqual(target().configHash, target({ credentialId: "other" }).configHash);
  assert.notEqual(target().configHash, target({ resourceId: "other" }).configHash);
  assert.notEqual(target().configHash, target({ event: "updated" }).configHash);
  assert.throws(() => target({ pollMinutes: "0" }), /polling interval/);
});
