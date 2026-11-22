import assert from "node:assert/strict";
import test from "node:test";
import { ProviderPollService } from "./provider-poll.service";
import { notionChangedPages } from "./notion-trigger-protocol";
import { airtableTriggerChanges } from "../execution/airtable";
import { BadRequestException } from "@nestjs/common";
import type { ProviderPollTarget } from "./provider-poll-target";

test("scheduler revisits a checkpoint just after its due time without polling early", async (t) => {
  const scheduler = process.env.SCHEDULER_ENABLED;
  const role = process.env.PROCESS_ROLE;
  delete process.env.SCHEDULER_ENABLED;
  delete process.env.PROCESS_ROLE;
  t.after(() => {
    if (scheduler === undefined) delete process.env.SCHEDULER_ENABLED; else process.env.SCHEDULER_ENABLED = scheduler;
    if (role === undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE = role;
  });
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: 0 });
  const due = 60_001;
  const calls: number[] = [];
  const service = new ProviderPollService({} as never, {} as never, {} as never);
  service.tick = async () => { if (Date.now() >= due && calls.length === 0) calls.push(Date.now()); };
  service.onModuleInit();
  await Promise.resolve();
  for (let elapsed = 15_000; elapsed <= 60_000; elapsed += 15_000) {
    t.mock.timers.tick(15_000);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.deepEqual(calls, []);
  t.mock.timers.tick(15_000);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [75_000]);
  await service.onModuleDestroy();
});

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
      return { event: "updated", verified: true, field: { name: "Modified", event: "updated", checkedAt: "2026-01-01T00:00:01.000Z" }, rows: [
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
  assert.equal(JSON.parse(first.cursor).at, "2026-01-01T00:00:02.000Z");
  assert.equal(JSON.parse(first.cursor).field.name, "Modified");
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

test("Airtable verifies metadata before delivering unseen changes but not known overlap", async () => {
  const calls: boolean[] = [];
  let known = false;
  const field = { name: "Modified", event: "updated" as const, checkedAt: new Date().toISOString() };
  class Fixture extends ProviderPollService {
    protected override readonly airtableChanges: typeof airtableTriggerChanges = async (_token, _base, _table, _id, _after, _read, _cached, force) => {
      calls.push(Boolean(force));
      return { event: "updated", field, verified: Boolean(force), rows: [{ id: "rec12345678901234", timestamp: "2026-01-01T00:00:02.000Z", item: {} }] };
    };
  }
  const prisma = { providerPollDelivery: { findMany: async ({ where }: { where: { changeKey: { in: string[] } } }) => known ? where.changeKey.in.map((changeKey) => ({ changeKey })) : [] } };
  const service = new Fixture(prisma as never, { airtableAccessToken: async () => "token" } as never, {} as never);
  const target: ProviderPollTarget = { workflowId: "w", versionId: "v", workspaceId: "s", nodeId: "n", provider: "airtable", credentialId: "c", resourceId: "app12345678901234", resourceType: "table", tableId: "tbl12345678901234", fieldId: "fld12345678901234", event: "updated", pollMinutes: 5, configHash: "hash" };
  const read = (service as unknown as { readAirtable: (target: ProviderPollTarget, cursor: string, baseline: Date) => Promise<{ cursor: string }> }).readAirtable.bind(service);
  const baseline = new Date("2026-01-01T00:00:00.000Z");
  const cursor = JSON.stringify({ at: baseline.toISOString(), event: "updated", field });
  const first = await read(target, cursor, baseline);
  assert.deepEqual(calls, [false, true]);
  known = true; calls.length = 0;
  await read(target, first.cursor, baseline);
  assert.deepEqual(calls, [false]);
});

test("Airtable uses the verified field and rows if a cached name was reused", async () => {
  const field = { name: "Old", event: "updated" as const, checkedAt: new Date().toISOString() };
  class Fixture extends ProviderPollService {
    protected override readonly airtableChanges: typeof airtableTriggerChanges = async (_token, _base, _table, _id, _after, _read, _cached, force) => force
      ? { event: "updated", verified: true, field: { ...field, name: "Renamed" }, rows: [{ id: "rec22345678901234", timestamp: "2026-01-01T00:00:03.000Z", item: { source: "verified" } }] }
      : { event: "updated", verified: false, field, rows: [{ id: "rec12345678901234", timestamp: "2026-01-01T00:00:02.000Z", item: { source: "stale" } }] };
  }
  const prisma = { providerPollDelivery: { findMany: async () => [] } };
  const service = new Fixture(prisma as never, { airtableAccessToken: async () => "token" } as never, {} as never);
  const target: ProviderPollTarget = { workflowId: "w", versionId: "v", workspaceId: "s", nodeId: "n", provider: "airtable", credentialId: "c", resourceId: "app12345678901234", resourceType: "table", tableId: "tbl12345678901234", fieldId: "fld12345678901234", event: "updated", pollMinutes: 5, configHash: "hash" };
  const read = (service as unknown as { readAirtable: (target: ProviderPollTarget, cursor: string, baseline: Date) => Promise<{ cursor: string; changes: Array<{ item: unknown }> }> }).readAirtable.bind(service);
  const baseline = new Date("2026-01-01T00:00:00.000Z");
  const result = await read(target, JSON.stringify({ at: baseline.toISOString(), event: "updated", field }), baseline);
  assert.equal(JSON.parse(result.cursor).field.name, "Renamed");
  assert.deepEqual(result.changes.map((change) => change.item), [{ source: "verified" }]);
});
