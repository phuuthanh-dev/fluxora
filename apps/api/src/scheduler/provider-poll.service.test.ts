import assert from "node:assert/strict";
import test from "node:test";
import { ProviderPollService } from "./provider-poll.service";
import { notionChangedPages } from "./notion-trigger-protocol";
import { airtableTriggerChanges } from "../execution/airtable";
import { BadRequestException } from "@nestjs/common";
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

test("Airtable polling overlaps the checkpoint and retains stable keys for duplicate deliveries", async () => {
  const times: string[] = [];
  class Fixture extends ProviderPollService {
    protected override readonly airtableChanges: typeof airtableTriggerChanges = async (_token, _base, _table, _field, after) => {
      times.push(after);
      return { event: "updated", rows: [
        { id: "rec-old", timestamp: "2026-01-01T00:00:00.000Z", item: {} },
        { id: "rec-new", timestamp: "2026-01-01T00:00:02.000Z", item: { name: "Sample" } },
      ] };
    };
  }
  const service = new Fixture({} as never, { airtableAccessToken: async () => "token" } as never, {} as never);
  const target: ProviderPollTarget = { workflowId: "workflow", versionId: "version", workspaceId: "workspace", nodeId: "node", provider: "airtable", credentialId: "credential", resourceId: "app12345678901234", resourceType: "table", tableId: "tbl12345678901234", fieldId: "fld12345678901234", event: "updated", pollMinutes: 5, configHash: "hash" };
  const read = (service as unknown as { readAirtable: (target: ProviderPollTarget, cursor: string, baseline: Date) => Promise<{ cursor: string; changes: Array<{ key: string }> }> }).readAirtable.bind(service);
  const baseline = new Date("2026-01-01T00:00:01.000Z");
  const first = await read(target, JSON.stringify({ at: baseline.toISOString(), event: "updated" }), baseline);
  const second = await read(target, first.cursor, baseline);
  assert.equal(times[0], "2026-01-01T00:00:00.000Z");
  assert.deepEqual(JSON.parse(first.cursor), { at: "2026-01-01T00:00:02.000Z", event: "updated" });
  assert.equal(first.changes.length, 1);
  assert.equal(first.changes[0]?.key, second.changes[0]?.key);
  await assert.rejects(read(target, JSON.stringify({ at: baseline.toISOString(), event: "created" }), baseline), /trigger changed/);
});

test("Airtable polling stops for a connection that must be reauthorized", async () => {
  const service = new ProviderPollService({} as never, { airtableAccessToken: async () => { throw new BadRequestException(); } } as never, {} as never);
  const read = (service as unknown as { readAirtable: (target: ProviderPollTarget, cursor: string, baseline: Date) => Promise<unknown> }).readAirtable.bind(service);
  const target: ProviderPollTarget = { workflowId: "w", versionId: "v", workspaceId: "s", nodeId: "n", provider: "airtable", credentialId: "c", resourceId: "app12345678901234", resourceType: "table", tableId: "tbl12345678901234", fieldId: "fld12345678901234", event: "created", pollMinutes: 5, configHash: "hash" };
  await assert.rejects(read(target, JSON.stringify({ at: "2026-01-01T00:00:00.000Z", event: "created" }), new Date("2026-01-01T00:00:00.000Z")), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "AIRTABLE_RECONNECT_REQUIRED" && "retryable" in error && error.retryable === false));
});
