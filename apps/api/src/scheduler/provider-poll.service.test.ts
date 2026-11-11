import assert from "node:assert/strict";
import test from "node:test";
import { ProviderPollService } from "./provider-poll.service";
import { notionChangedPages } from "./notion-trigger-protocol";
import type { ProviderPollTarget } from "./provider-poll-target";

test("Notion polling overlaps its checkpoint and uses a stable key for repeated created pages", async () => {
  const times: string[] = [];
  class Fixture extends ProviderPollService {
    protected override readonly notionChanges: typeof notionChangedPages = async (_token, _source, after) => {
      times.push(after);
      return [{ id: "11111111-1111-4111-8111-111111111111", createdTime: "2030-01-01T00:00:01.000Z", editedTime: "2030-01-01T00:00:02.000Z", item: { title: "Example" } }];
    };
  }
  const credentials = { runNotionOperation: async (_id: string, _workspace: string, fn: () => Promise<unknown>) => fn(), readForExecution: async () => ({ token: "example-token" }) };
  const service = new Fixture({} as never, credentials as never, {} as never);
  const target: ProviderPollTarget = { workflowId: "workflow", versionId: "version", workspaceId: "workspace", nodeId: "node", provider: "notion", credentialId: "credential", resourceId: "11111111-1111-4111-8111-111111111111", resourceType: "data-source", event: "created", pollMinutes: 5, configHash: "hash" };
  const read = (service as unknown as { readNotion: (target: ProviderPollTarget, cursor: string, baseline: Date) => Promise<{ cursor: string; changes: Array<{ key: string }> }> }).readNotion.bind(service);
  const baseline = new Date("2030-01-01T00:00:00.000Z");
  const first = await read(target, baseline.toISOString(), baseline);
  const second = await read(target, first.cursor, baseline);
  assert.equal(times[0], "2029-12-31T23:59:59.000Z");
  assert.equal(first.cursor, "2030-01-01T00:00:02.000Z");
  assert.equal(first.changes[0]?.key, second.changes[0]?.key);
});
