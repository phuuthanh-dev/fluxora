import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowService } from "./workflow.service";

test("workflow list reports only current active trigger problems in the authorized workspace", async () => {
  const types: Record<string, string[]> = { retry: ["trigger.airtable.record"], error: ["trigger.rss.new-item", "trigger.google-calendar.event"], stale: ["trigger.airtable.record"], gmail: ["trigger.gmail"], missing: ["trigger.notion.page"], inactive: ["trigger.airtable.record"] };
  const version = (id: string, key: string) => ({ id, version: 1, status: "PUBLISHED", graph: { nodes: types[key]!.map((type, index) => ({ id: `node-${index}`, type, position: { x: 0, y: 0 }, config: {} })), edges: [] } });
  const workflow = (id: string, isActive = true) => ({ id, workspaceId: "workspace", name: id, description: null, archivedAt: null, isActive, activatedAt: null, draftVersion: null, publishedVersion: version(`version-${id}`, id), createdAt: new Date(), updatedAt: new Date() });
  let authorized = false;
  const scoped = async (query: { where: { workflowId?: { in: string[] }; workflowVersionId?: { in: string[] } } }, rows: unknown[]) => {
    assert.equal(authorized, true);
    if (query.where.workflowId) assert.deepEqual(query.where.workflowId.in, ["retry", "error", "stale", "gmail", "missing"]);
    if (query.where.workflowVersionId) assert.deepEqual(query.where.workflowVersionId.in, ["version-retry", "version-error", "version-stale", "version-gmail", "version-missing"]);
    return rows;
  };
  const db = {
    workflow: { findMany: async () => [workflow("retry"), workflow("error"), workflow("stale"), workflow("gmail"), workflow("missing"), workflow("inactive", false)] },
    providerPollCheckpoint: { findMany: (q: Parameters<typeof scoped>[0]) => scoped(q, [
      { workflowId: "retry", workflowVersionId: "version-retry", nodeId: "node-0", state: "READY", lastErrorCode: "HTTP_ERROR" },
      { workflowId: "stale", workflowVersionId: "old-version", nodeId: "node-0", state: "ERROR", lastErrorCode: "INVALID_INPUT" },
      { workflowId: "stale", workflowVersionId: "version-stale", nodeId: "node-0", state: "READY", lastErrorCode: null },
      { workflowId: "inactive", workflowVersionId: "version-inactive", nodeId: "node-0", state: "ERROR", lastErrorCode: "INVALID_INPUT" },
    ]) },
    rssTriggerCheckpoint: { findMany: (q: Parameters<typeof scoped>[0]) => scoped(q, [{ workflowId: "error", workflowVersionId: "version-error", nodeId: "node-0", state: "ERROR", lastErrorCode: "RSS_NOT_READY" }]) },
    calendarTriggerCheckpoint: { findMany: (q: Parameters<typeof scoped>[0]) => scoped(q, [{ workflowId: "error", workflowVersionId: "version-error", nodeId: "node-1", state: "READY", lastErrorCode: "HTTP_ERROR" }]) },
    gmailTriggerCheckpoint: { findMany: (q: Parameters<typeof scoped>[0]) => scoped(q, [{ workflowVersionId: "version-gmail", nodeId: "node-0", state: "ERROR", lastErrorCode: "GMAIL_POLL_FAILED" }]) },
  };
  const service = new WorkflowService(db as never, { requireOwner: async () => { authorized = true; } } as never);
  const result = await service.list("workspace", "owner");
  assert.deepEqual(result.map((item) => [item.id, item.triggerHealth]), [["retry", "retrying"], ["error", "attention"], ["stale", null], ["gmail", "attention"], ["missing", "attention"], ["inactive", null]]);
  const denied = new WorkflowService(db as never, { requireOwner: async () => { throw new Error("not owner"); } } as never);
  authorized = false;
  await assert.rejects(denied.list("other", "user"), /not owner/);
  assert.equal(authorized, false);
});
