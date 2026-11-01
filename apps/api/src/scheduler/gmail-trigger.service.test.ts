import assert from "node:assert/strict";
import test from "node:test";
import { GmailTriggerService } from "./gmail-trigger.service";
import { NodeFailure } from "../execution/node-failure";

function fixture() {
  const checkpoint: Record<string, unknown> = { workflowVersionId: "v1", nodeId: "node", historyId: "1", mailboxHash: "mailbox", pageToken: null, state: "READY", leaseToken: null, leaseExpiresAt: null, nextPollAt: null, lastErrorCode: null };
  const deliveries = new Map<string, Record<string, unknown>>();
  const executions = new Map<string, { id: string }>();
  const dispatches: string[] = [];
  let failQueue = false; let failAfterEnqueue = false; let active = true; let expired = false; let missing = false; let mailboxHash = "mailbox";
  const pages: Array<{ messageIds: string[]; historyId: string; nextPageToken: string | null }> = [{ messageIds: ["m1"], historyId: "2", nextPageToken: null }];
  const prisma = {
    workflow: { findFirst: async () => active ? { id: "flow" } : null },
    gmailTriggerCheckpoint: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (where.workflowVersionId !== checkpoint.workflowVersionId || where.nodeId !== checkpoint.nodeId) return { count: 0 };
        if (where.state && where.state !== checkpoint.state) return { count: 0 };
        if (where.leaseToken && where.leaseToken !== checkpoint.leaseToken) return { count: 0 };
        const expiry = checkpoint.leaseExpiresAt as Date | null;
        if (where.AND && ((expiry && expiry >= new Date()) || (checkpoint.nextPollAt instanceof Date && checkpoint.nextPollAt > new Date()))) return { count: 0 };
        if (where.leaseExpiresAt && (!expiry || expiry <= new Date())) return { count: 0 };
        Object.assign(checkpoint, data); return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...checkpoint }),
    },
    gmailTriggerDelivery: {
      upsert: async ({ where, create }: { where: { workflowVersionId_nodeId_messageId: { messageId: string } }; create: Record<string, unknown> }) => {
        const id = where.workflowVersionId_nodeId_messageId.messageId;
        if (!deliveries.has(id)) deliveries.set(id, { ...create, dispatchedAt: null, executionId: null });
        return { ...deliveries.get(id)! };
      },
      update: async ({ where, data }: { where: { workflowVersionId_nodeId_messageId: { messageId: string } }; data: Record<string, unknown> }) => Object.assign(deliveries.get(where.workflowVersionId_nodeId_messageId.messageId)!, data),
    },
  };
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "token" }) };
  const executionService = { createGmailScheduledExecution: async (_version: string, _workflow: string, _node: string, messageId: string, _lease: string, _data: unknown, key: string) => { if (!executions.has(key)) executions.set(key, { id: `execution-${executions.size + 1}` }); const execution = executions.get(key)!; deliveries.get(messageId)!.executionId = execution.id; return { execution, alreadyDispatched: false }; } };
  const queue = { dispatch: async ({ executionId }: { executionId: string }) => { if (failQueue) { failQueue = false; throw new Error("queue offline"); } if (!dispatches.includes(executionId)) dispatches.push(executionId); if (failAfterEnqueue) { failAfterEnqueue = false; throw new Error("ack lost"); } } };
  const service = new GmailTriggerService(prisma as never, credentials as never, executionService as never, queue as never);
  Object.defineProperty(service, "provider", { value: {
    getGmailHistoryBaseline: async () => ({ historyId: "99", mailboxHash }),
    getGmailHistoryPage: async () => { if (expired) throw new NodeFailure("GMAIL_HISTORY_EXPIRED", "expired", false); return pages.shift() ?? { messageIds: [], historyId: "2", nextPageToken: null }; },
    getGmailMessage: async (_token: string, id: string) => { if (missing) throw new NodeFailure("GMAIL_ERROR", "not found", false, 404); return { id, labels: ["INBOX", "Label_1"], from: "Support <support@example.test>", subject: "Example request" }; },
  } });
  return { service, checkpoint, deliveries, executions, dispatches, pages, setQueueFailure: () => { failQueue = true; }, loseQueueAck: () => { failAfterEnqueue = true; }, setActive: (value: boolean) => { active = value; }, setExpired: () => { expired = true; }, setMissing: () => { missing = true; }, setMailbox: (value: string) => { mailboxHash = value; } };
}

test("queue recovery resumes after the approved node and refuses ambiguous progress", async () => {
  const graph = { nodes: [
    { id: "mail", type: "trigger.gmail", position: { x: 0, y: 0 }, config: {} },
    { id: "approve", type: "approval.request", position: { x: 1, y: 0 }, config: {} },
    { id: "next", type: "condition.if", position: { x: 2, y: 0 }, config: {} },
  ], edges: [{ id: "a", source: "mail", target: "approve", kind: "success" }, { id: "b", source: "approve", target: "next", kind: "success" }] };
  const queued = [
    { id: "initial", workflowVersion: { graph }, nodeExecutions: [], approvalRequests: [] },
    { id: "resumed", workflowVersion: { graph }, nodeExecutions: [{ nodeId: "mail", status: "SUCCEEDED", output: {} }, { nodeId: "approve", status: "SUCCEEDED", output: { approvalRequestId: "approval-1" } }], approvalRequests: [{ id: "approval-1" }] },
    { id: "ambiguous", workflowVersion: { graph }, nodeExecutions: [{ nodeId: "mail", status: "SUCCEEDED", output: {} }], approvalRequests: [] },
    { id: "missing-approval-node", workflowVersion: { graph }, nodeExecutions: [], approvalRequests: [{ id: "approval-2" }] },
  ];
  const jobs: unknown[] = [];
  const service = new GmailTriggerService({ execution: { findMany: async () => queued } } as never, {} as never, {} as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  await service.recoverQueued();
  assert.deepEqual(jobs, [
    { executionId: "initial", mode: "live" },
    { executionId: "resumed", mode: "live", startNodeIds: ["next"] },
  ]);
});

test("queue failure retains checkpoint and retries the same execution", async () => {
  const f = fixture(); f.setQueueFailure();
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(f.checkpoint.historyId, "1"); assert.equal(f.checkpoint.lastErrorCode, "GMAIL_POLL_FAILED");
  f.pages.push({ messageIds: ["m1"], historyId: "2", nextPageToken: null });
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(f.checkpoint.historyId, "2"); assert.equal(f.executions.size, 1); assert.deepEqual(f.dispatches, ["execution-1"]);
});

test("an ambiguous queue acknowledgement reuses the same execution", async () => {
  const f = fixture(); f.loseQueueAck();
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(f.checkpoint.historyId, "1"); assert.equal(f.dispatches.length, 1);
  f.pages.push({ messageIds: ["m1"], historyId: "2", nextPageToken: null });
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(f.executions.size, 1); assert.equal(f.dispatches.length, 1); assert.equal(f.checkpoint.historyId, "2");
});

test("page continuation preserves the original history ID until all pages are processed", async () => {
  const f = fixture(); f.pages.splice(0, 1, { messageIds: ["m1"], historyId: "3", nextPageToken: "next" }, { messageIds: ["m2"], historyId: "3", nextPageToken: null });
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(f.checkpoint.historyId, "1"); assert.equal(f.checkpoint.pageToken, "next");
  f.checkpoint.nextPollAt = new Date(0);
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(f.checkpoint.historyId, "3"); assert.equal(f.checkpoint.pageToken, null); assert.equal(f.dispatches.length, 2);
});

test("configured polling interval prevents an early extra poll", async () => {
  const f = fixture();
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred", pollMinutes: "15" });
  const next = f.checkpoint.nextPollAt as Date;
  assert.ok(next.getTime() >= Date.now() + 14 * 60_000);
  f.pages.push({ messageIds: ["m2"], historyId: "3", nextPageToken: null });
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred", pollMinutes: "15" });
  assert.equal(f.dispatches.length, 1);
});

test("a full page is resumed without losing messages beyond the per-check limit", async () => {
  const f = fixture();
  const page = { messageIds: Array.from({ length: 12 }, (_, index) => `message-${index}`), historyId: "2", nextPageToken: null };
  f.pages.splice(0, 1, page, page);
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred", maxMessages: "10" });
  assert.equal(f.dispatches.length, 10); assert.equal(f.checkpoint.historyId, "1");
  f.checkpoint.nextPollAt = new Date(0);
  await f.service.poll("v1", "flow", "space", "node", { credentialId: "cred", maxMessages: "10" });
  assert.equal(f.dispatches.length, 12); assert.equal(f.checkpoint.historyId, "2");
});

test("sender, subject and label filters skip nonmatching messages without triggering workflows", async () => {
  const matching = fixture();
  await matching.service.poll("v1", "flow", "space", "node", { credentialId: "cred", sender: "SUPPORT@EXAMPLE.TEST", subject: "request", labelId: "Label_1" });
  assert.equal(matching.dispatches.length, 1);
  const filtered = fixture();
  await filtered.service.poll("v1", "flow", "space", "node", { credentialId: "cred", labelId: "other-label" });
  assert.equal(filtered.dispatches.length, 0); assert.equal(filtered.deliveries.get("m1")?.skipReason, "filter_not_matched");
});

test("expired history and changed mailboxes require an explicit restart", async () => {
  const expired = fixture(); expired.setExpired();
  await expired.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(expired.checkpoint.state, "ERROR"); assert.equal(expired.checkpoint.historyId, "1");
  const changed = fixture(); changed.setMailbox("other");
  await changed.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(changed.checkpoint.lastErrorCode, "GMAIL_MAILBOX_CHANGED"); assert.equal(changed.checkpoint.state, "ERROR");
  const missing = fixture(); missing.setMissing();
  await missing.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(missing.checkpoint.lastErrorCode, "GMAIL_MESSAGE_MISSING"); assert.equal(missing.checkpoint.historyId, "1");
});

test("a live lease and a deactivated workflow do not dispatch", async () => {
  const locked = fixture(); locked.checkpoint.leaseToken = "other"; locked.checkpoint.leaseExpiresAt = new Date(Date.now() + 60_000);
  await locked.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(locked.dispatches.length, 0);
  const inactive = fixture(); inactive.setActive(false);
  await inactive.service.poll("v1", "flow", "space", "node", { credentialId: "cred" });
  assert.equal(inactive.dispatches.length, 0); assert.equal(inactive.checkpoint.historyId, "1");
});
