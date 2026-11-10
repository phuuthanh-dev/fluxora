import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { WebhookService, hashWebhookSecret } from "./webhook.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";
import { WebhookController } from "./webhook.controller";

const secret = "synthetic-slack-signing-fixture";
const graph = { nodes: [{ id: "slack", type: "trigger.slack.event", position: { x: 0, y: 0 }, config: { event: "app_mention", channel: "CEXAMPLE", credentialId: "connection" } }], edges: [] };
const vault = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) };

test("Slack accepts signed challenge before activation; events are workspace-bound and durably dispatched", async () => {
  validatePublishableGraph(parseWorkflowGraph(graph));
  assert.throws(() => validatePublishableGraph(parseWorkflowGraph({ ...graph, nodes: [{ ...graph.nodes[0]!, config: { ...graph.nodes[0]!.config, channel: "{{ input.channel }}" } }] })));
  const endpoint = { id: "endpoint", path: "slack-test", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret(secret), encryptedSigningSecret: vault.encrypt({ secret }), workflow: { workspaceId: "workspace", publishedVersionId: "version", isActive: false, archivedAt: null }, workflowVersion: { graph } };
  const captured: unknown[] = [], jobs: unknown[] = [];
  let finishDispatch!: () => void;
  const dispatching = new Promise<void>((resolve) => { finishDispatch = resolve; });
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createSlackScheduledExecution: async (input: unknown) => { captured.push(input); return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); await dispatching; } } as never, { readForExecution: async (id: string, workspace: string) => { assert.equal(id, "connection"); assert.equal(workspace, "workspace"); return { teamId: "TEXAMPLE" }; } } as never, vault as never);
  const receive = (data: unknown, valid = true) => {
    const rawBody = Buffer.from(JSON.stringify(data)), timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(rawBody).digest("hex")}`;
    return service.receive("slack-test", undefined, data, undefined, { rawBody }, undefined, undefined, undefined, undefined, undefined, { timestamp, signature: valid ? signature : "bad" });
  };
  await assert.rejects(receive({ type: "url_verification", challenge: "challenge" }, false));
  assert.deepEqual(await receive({ type: "url_verification", challenge: "challenge" }), { challenge: "challenge" });
  const event = { type: "event_callback", event_id: "Ev123", team_id: "TEXAMPLE", api_app_id: "AEXAMPLE", event: { type: "app_mention", channel: "CEXAMPLE", user: "UEXAMPLE", text: "Hello", ts: "1794213000.123456" } };
  await receive(event); assert.equal(captured.length, 0);
  endpoint.workflow.isActive = true;
  await receive({ ...event, team_id: "TOTHER" }); assert.equal(captured.length, 0);
  assert.deepEqual(await receive(event), { acknowledged: true });
  assert.equal(captured.length, 1); assert.ok(!JSON.stringify(captured).includes(secret));
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
  endpoint.workflow.publishedVersionId = "new-version";
  await assert.rejects(receive(event)); assert.equal(captured.length, 1);
  let drained = false;
  const draining = service.onModuleDestroy().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false);
  finishDispatch(); await draining; assert.equal(drained, true);
});


test("Slack registration imports its signing secret without returning it", async () => {
  let saved: Record<string, unknown> = {};
  const workflow = { id: "workflow", workspaceId: "workspace", publishedVersion: { id: "version", graph } };
  const prisma = {
    workflow: { findFirst: async () => workflow },
    webhookEndpoint: { findFirst: async () => null },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      $queryRaw: async () => [{ publishedVersionId: "version" }],
      webhookEndpoint: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { ...data, id: "endpoint", createdAt: new Date(), updatedAt: new Date() }; } },
      auditLog: { create: async () => ({}) },
    }),
  };
  const service = new WebhookService(prisma as never, {} as never, {} as never, {} as never, vault as never);
  const expected = { publishedVersionId: "version", endpoint: null };
  await assert.rejects(service.createEndpoint("workflow", "owner", "slack-test", true, expected));
  const result = await service.createEndpoint("workflow", "owner", "slack-test", true, expected, secret);
  assert.equal(result.secret, null);
  assert.equal(saved.secretHash, hashWebhookSecret(secret));
  assert.equal(vault.decrypt(saved.encryptedSigningSecret as string).secret, secret);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("Slack HTTP acknowledgement is 200 while other webhook response codes remain unchanged", async () => {
  const controller = new WebhookController({ receive: async () => ({ challenge: "synthetic-challenge" }) } as never);
  let status: number | undefined;
  const response = { status: (value: number) => { status = value; } };
  assert.deepEqual(await controller.receive("path", undefined, undefined, undefined, undefined, Buffer.from("{}"), { body: {} } as never, undefined, undefined, undefined, undefined, undefined, undefined, "v0=signature", "1794213000", response as never), { challenge: "synthetic-challenge" });
  assert.equal(status, 200);
  status = undefined;
  await controller.receive("path", undefined, undefined, undefined, undefined, Buffer.from("{}"), { body: {} } as never, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, response as never);
  assert.equal(status, undefined);
});

test("shared Slack ingress routes only the signed app/team to each owned active subscription", async (t) => {
  const previousSecret = process.env.SLACK_SIGNING_SECRET, previousApp = process.env.SLACK_APP_ID;
  process.env.SLACK_SIGNING_SECRET = secret; process.env.SLACK_APP_ID = "AEXAMPLE";
  t.after(() => { if (previousSecret === undefined) delete process.env.SLACK_SIGNING_SECRET; else process.env.SLACK_SIGNING_SECRET = previousSecret; if (previousApp === undefined) delete process.env.SLACK_APP_ID; else process.env.SLACK_APP_ID = previousApp; });
  const endpoints = ["one", "two", "stale", "removed"].map((id) => ({ id, path: id, workflowId: id, workflowVersionId: "version", secretHash: hashWebhookSecret(secret), encryptedSigningSecret: vault.encrypt({ secret }), workflow: { workspaceId: id, publishedVersionId: id === "stale" ? "new" : "version" }, workflowVersion: { graph } }));
  const runs: unknown[] = [], reads: string[] = []; let lookups = 0;
  const service = new WebhookService({ webhookEndpoint: { findMany: async ({ where }: { where: unknown }) => { lookups++; assert.match(JSON.stringify(where), /isActive/); return endpoints; } } } as never, { createSlackScheduledExecution: async (input: unknown) => { runs.push(input); return { id: "run", status: "SUCCEEDED" }; } } as never, {} as never, { readForExecution: async (_id: string, workspace: string) => { reads.push(workspace); if (workspace === "removed") throw new NotFoundException(); return { appId: "AEXAMPLE", teamId: workspace === "one" ? "TONE" : "TTWO" }; } } as never, vault as never);
  const receive = (payload: unknown, valid = true) => {
    const raw = Buffer.from(JSON.stringify(payload)), timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(raw).digest("hex")}`;
    return service.receiveSlackEvent(raw, { timestamp, signature: valid ? signature : "invalid" });
  };
  const event = { type: "event_callback", event_id: "EvONE", api_app_id: "AEXAMPLE", team_id: "TONE", event: { type: "app_mention", channel: "CEXAMPLE", user: "UEXAMPLE", text: "Hello", ts: "1794213000.123456" } };
  await assert.rejects(receive(event, false)); assert.equal(lookups, 0);
  assert.deepEqual(await receive({ type: "url_verification", challenge: "challenge" }), { challenge: "challenge" });
  await receive({ ...event, api_app_id: "AOTHER" }); await receive({ ...event, is_ext_shared_channel: true }); assert.equal(lookups, 0);
  await receive(event); assert.equal(runs.length, 1); assert.equal((runs[0] as { workflowId: string }).workflowId, "one"); assert.deepEqual(reads, ["one", "two", "removed"]);
  await receive({ ...event, event_id: "EvTWO", team_id: "TTWO" }); assert.equal(runs.length, 2); assert.equal((runs[1] as { workflowId: string }).workflowId, "two");
  await receive({ ...event, event: { ...event.event, channel: "COTHER" } }); assert.equal(runs.length, 2);
  assert.ok(!JSON.stringify(runs).includes(secret));
});
