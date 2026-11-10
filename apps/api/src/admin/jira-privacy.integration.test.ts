import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { CredentialService } from "../credentials/credential.service";
import { saveJiraAuthorization } from "../credentials/jira-oauth";
import { jiraAccountHash } from "../credentials/jira-privacy-attribution";
import { ExecutionService } from "../execution/execution.service";
import { JiraPrivacyService } from "./jira-privacy.service";

const enabled = process.env.FLUXORA_CREDENTIAL_INTEGRATION === "1";
async function fixture() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw Error("Privacy tests require an isolated local test database.");
  const db = new PrismaClient(), suffix = randomUUID(), vault = new CredentialVaultService();
  const user = await db.user.create({ data: { email: `privacy-${suffix}@example.test` } });
  const workspace = await db.workspace.create({ data: { name: "Privacy test", slug: `privacy-${suffix}`, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } } } });
  const accountId = `privacy-${suffix}`, accountHash = jiraAccountHash(accountId);
  const grant = { accessToken: `synthetic-access-${suffix}`, refreshToken: `synthetic-refresh-${suffix}`, cloudId: randomUUID(), siteName: "Synthetic site", accountId };
  await saveJiraAuthorization(db as never, vault, workspace.id, user.id, grant);
  const credential = await db.credential.findFirstOrThrow({ where: { workspaceId: workspace.id } });
  const workflow = await db.workflow.create({ data: { workspaceId: workspace.id, name: "Synthetic Jira workflow" } });
  const graph = { nodes: [{ id: "jira", type: "action.jira.get-issue", config: { credentialId: credential.id, issue: "TEST-1" } }], edges: [] };
  const version = await db.workflowVersion.create({ data: { workflowId: workflow.id, version: 1, status: "PUBLISHED", graph } });
  const execution = await db.execution.create({ data: { workflowVersionId: version.id, status: "FAILED", triggerData: { note: "synthetic-personal-data" }, errorMessage: "synthetic-personal-data", startedAt: new Date(), completedAt: new Date() } });
  const node = await db.nodeExecution.create({ data: { executionId: execution.id, nodeId: "downstream", status: "FAILED", input: { note: "synthetic-personal-data" }, output: { note: "synthetic-personal-data" }, errorMessage: "synthetic-personal-data" } });
  await db.nodeExecutionItem.create({ data: { nodeExecutionId: node.id, itemIndex: 0, status: "FAILED", input: { note: "synthetic-personal-data" }, output: { note: "synthetic-personal-data" }, errorMessage: "synthetic-personal-data" } });
  const service = new JiraPrivacyService(db as never, vault);
  const cleanup = async () => {
    await db.execution.deleteMany({ where: { workflowVersion: { workflow: { workspaceId: workspace.id } } } });
    await db.workflowVersion.deleteMany({ where: { workflow: { workspaceId: workspace.id } } });
    await db.workflow.deleteMany({ where: { workspaceId: workspace.id } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: user.id }, { workspaceId: workspace.id }] } });
    await db.credential.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.jiraPrivacyAccount.deleteMany({ where: { accountHash } });
    await db.$disconnect();
  };
  return { db, user, workspace, credential, workflow, version, graph, execution, accountId, accountHash, grant, vault, service, cleanup };
}

for (const action of ["closed", "updated"] as const) test(`reviewed Jira ${action} response erases payload copies atomically, preserves metadata and blocks retry`, { skip: !enabled }, async () => {
  const f = await fixture();
  try {
    const unrelated = await f.db.workflowVersion.create({ data: { workflowId: f.workflow.id, version: 2, status: "DRAFT", graph: { nodes: [], edges: [] } } });
    const copied = await f.db.execution.create({ data: { workflowVersionId: unrelated.id, status: "SUCCEEDED", triggerData: { note: "copied historical data" } } });
    const otherWorkflow = await f.db.workflow.create({ data: { workspaceId: f.workspace.id, name: "Unrelated" } });
    const otherVersion = await f.db.workflowVersion.create({ data: { workflowId: otherWorkflow.id, version: 1, graph: { nodes: [], edges: [] } } });
    const retained = await f.db.execution.create({ data: { workflowVersionId: otherVersion.id, status: "SUCCEEDED", triggerData: { keep: true } } });
    await f.db.jiraPrivacyAccount.update({ where: { accountHash: f.accountHash }, data: { state: "ACTION_REQUIRED", requiredAction: action } });
    const preview = await f.service.preview(f.accountHash, f.user.id);
    assert.equal(preview.counts.executions, 2);
    assert.deepEqual(preview.blockers, []);
    assert.doesNotMatch(JSON.stringify(preview), /synthetic-personal-data|encryptedAccountId|accessToken|refreshToken/);
    assert.equal(JSON.stringify(preview).includes(f.accountId), false);
    const input = { previewToken: preview.previewToken, copiesReviewed: true, confirmation: "ERASE", reviewReference: "SYNTHETIC-REVIEW-1" };
    await assert.rejects(f.service.resolve(f.accountHash, "different-admin", input));
    await assert.rejects(f.service.resolve(f.accountHash, f.user.id, { ...input, copiesReviewed: false }));
    assert.ok((await f.db.execution.findUniqueOrThrow({ where: { id: f.execution.id } })).triggerData);
    assert.deepEqual(await f.service.resolve(f.accountHash, f.user.id, input), { resolved: true, erasedExecutions: 2, removedConnections: 1 });
    const erased = await f.db.execution.findUniqueOrThrow({ where: { id: f.execution.id }, include: { nodeExecutions: { include: { items: true } } } });
    assert.equal(erased.status, "FAILED"); assert.deepEqual(erased.startedAt, f.execution.startedAt); assert.deepEqual(erased.completedAt, f.execution.completedAt);
    assert.equal(erased.triggerData, null); assert.equal(erased.errorMessage, null); assert.ok(erased.privacyErasedAt);
    const erasedNode = erased.nodeExecutions[0]; assert.ok(erasedNode);
    const erasedItem = erasedNode.items[0]; assert.ok(erasedItem);
    assert.equal(erasedNode.output, null); assert.equal(erasedItem.input, null); assert.equal(erasedItem.errorMessage, null);
    assert.equal((await f.db.execution.findUniqueOrThrow({ where: { id: copied.id } })).triggerData, null);
    assert.deepEqual((await f.db.execution.findUniqueOrThrow({ where: { id: retained.id } })).triggerData, { keep: true });
    assert.deepEqual((await f.db.workflowVersion.findUniqueOrThrow({ where: { id: f.version.id } })).graph, f.graph);
    assert.equal(await f.db.credential.count({ where: { id: f.credential.id } }), 0);
    assert.equal(await f.db.jiraPrivacyAccount.count({ where: { accountHash: f.accountHash } }), 0);
    const runtime = new ExecutionService(f.db as never, {} as never, {} as never);
    await assert.rejects(runtime.retry(f.execution.id, f.user.id), /erased/);
    const audit = await f.db.auditLog.findFirstOrThrow({ where: { actorId: f.user.id, action: "admin.jira_privacy_erased" } });
    assert.equal(JSON.stringify(audit).includes(f.accountId), false); assert.equal(JSON.stringify(audit).includes(f.accountHash), false);
  } finally { await f.cleanup(); }
});

test("Jira erasure rejects active work, changed previews, unreviewed legacy data and held provider access", { skip: !enabled }, async () => {
  const f = await fixture();
  try {
    await f.db.jiraPrivacyAccount.update({ where: { accountHash: f.accountHash }, data: { state: "ACTION_REQUIRED", requiredAction: "closed", coverageReviewedAt: null } });
    const preview = await f.service.preview(f.accountHash, f.user.id);
    const input = { previewToken: preview.previewToken, copiesReviewed: true, confirmation: "ERASE", reviewReference: "SYNTHETIC-REVIEW-2" };
    await assert.rejects(f.service.resolve(f.accountHash, f.user.id, input), /legacy/i);
    await f.db.workflow.update({ where: { id: f.workflow.id }, data: { isActive: true } });
    await assert.rejects(f.service.resolve(f.accountHash, f.user.id, { ...input, legacyReviewed: true }), /changed/i);
    const activePreview = await f.service.preview(f.accountHash, f.user.id); assert.ok(activePreview.blockers.some((value) => value.includes("Deactivate")));
    await f.db.workflow.update({ where: { id: f.workflow.id }, data: { isActive: false } });
    await f.db.execution.update({ where: { id: f.execution.id }, data: { status: "WAITING_APPROVAL" } });
    const waitingPreview = await f.service.preview(f.accountHash, f.user.id); assert.ok(waitingPreview.blockers.some((value) => value.includes("approval")));
    const credentials = new CredentialService(f.db as never, {} as never, f.vault);
    await assert.rejects(credentials.readForExecution(f.credential.id, f.workspace.id, "JIRA"), /paused/);
    await assert.rejects(saveJiraAuthorization(f.db as never, f.vault, f.workspace.id, f.user.id, f.grant), /administrator/);
    assert.equal(await f.db.credential.count({ where: { workspaceId: f.workspace.id } }), 1);
  } finally { await f.cleanup(); }
});

test("Jira attribution survives deletion and inventory does not invent missing legacy identities", { skip: !enabled }, async () => {
  const f = await fixture();
  try {
    await f.db.credential.delete({ where: { id: f.credential.id } });
    const row = await f.db.jiraPrivacyAccount.findUniqueOrThrow({ where: { accountHash: f.accountHash } });
    assert.deepEqual(row.credentialIds, [f.credential.id]); assert.deepEqual(row.workspaceIds, [f.workspace.id]);
    await f.db.jiraPrivacyAccount.update({ where: { accountHash: f.accountHash }, data: { credentialIds: [], workspaceIds: [], coverageReviewedAt: null, state: "ACTION_REQUIRED", requiredAction: "updated" } });
    const preview = await f.service.preview(f.accountHash, f.user.id);
    assert.ok(preview.blockers.some((value) => value.includes("Attribution is missing")));
    await assert.rejects(f.service.resolve(f.accountHash, f.user.id, { previewToken: preview.previewToken, confirmation: "ERASE", reviewReference: "SYNTHETIC-REVIEW-3", copiesReviewed: true, legacyReviewed: true }));
    assert.ok((await f.db.execution.findUniqueOrThrow({ where: { id: f.execution.id } })).triggerData);
  } finally { await f.cleanup(); }
});

test("a concurrent execution state change aborts Jira erasure without deleting data", { skip: !enabled, timeout: 15_000 }, async () => {
  const f = await fixture();
  let release!: () => void, observed!: () => void;
  const continueQuery = new Promise<void>((resolve) => { release = resolve; });
  const inventoryRead = new Promise<void>((resolve) => { observed = resolve; });
  let first = true;
  try {
    await f.db.jiraPrivacyAccount.update({ where: { accountHash: f.accountHash }, data: { state: "ACTION_REQUIRED", requiredAction: "closed" } });
    const preview = await f.service.preview(f.accountHash, f.user.id);
    const instrumented = f.db.$extends({ query: { execution: { async findMany({ args, query }) {
      const result = await query(args);
      if (first) { first = false; observed(); await continueQuery; }
      return result;
    } } } });
    const service = new JiraPrivacyService(instrumented as never, f.vault);
    const pending = service.resolve(f.accountHash, f.user.id, { previewToken: preview.previewToken, copiesReviewed: true, confirmation: "ERASE", reviewReference: "SYNTHETIC-RACE-REVIEW" });
    const rejected = assert.rejects(pending);
    await inventoryRead;
    await f.db.execution.update({ where: { id: f.execution.id }, data: { status: "RUNNING" } });
    release(); await rejected;
    const retained = await f.db.execution.findUniqueOrThrow({ where: { id: f.execution.id } });
    assert.equal(retained.privacyErasedAt, null); assert.ok(retained.triggerData);
    assert.equal(await f.db.credential.count({ where: { id: f.credential.id } }), 1);
  } finally { release(); await f.cleanup(); }
});

test("uncertain Jira reports require a reviewed later cycle and do not dispatch on recovery", { skip: !enabled }, async () => {
  const f = await fixture();
  try {
    const attemptedAt = new Date();
    await f.db.jiraPrivacyAccount.update({ where: { accountHash: f.accountHash }, data: { state: "UNCERTAIN", cycleDays: 14, lastAttemptAt: attemptedAt } });
    // An uncertain reporting request holds reporting, not the user's unrelated Jira work.
    const credentials = new CredentialService(f.db as never, {} as never, f.vault);
    assert.equal((await credentials.readForExecution(f.credential.id, f.workspace.id, "JIRA")).accountId, f.accountId);
    const input = { reviewReference: "SYNTHETIC-PROVIDER-REVIEW", providerReviewed: true, nextReportAt: new Date(Date.now() + 86400_000).toISOString() };
    await assert.rejects(f.service.recover(f.accountHash, f.user.id, input), /cycle/);
    const nextReportAt = new Date(Date.now() + 15 * 86400_000).toISOString();
    assert.equal((await f.service.recover(f.accountHash, f.user.id, { ...input, nextReportAt })).scheduled, true);
    const row = await f.db.jiraPrivacyAccount.findUniqueOrThrow({ where: { accountHash: f.accountHash } });
    assert.equal(row.state, "READY"); assert.equal(row.nextReportAt.toISOString(), nextReportAt);
    await assert.rejects(f.service.recover(f.accountHash, f.user.id, { ...input, nextReportAt }));
  } finally { await f.cleanup(); }
});

test("current-connection inventory restores only known legacy links and preserves the oldest date", { skip: !enabled }, async () => {
  const f = await fixture();
  try {
    const oldest = new Date("2025-01-01T00:00:00Z");
    await f.db.jiraPrivacyAccount.update({ where: { accountHash: f.accountHash }, data: { credentialIds: [], workspaceIds: [], coverageReviewedAt: null, oldestDataAt: oldest } });
    await f.service.discover(f.user.id);
    const row = await f.db.jiraPrivacyAccount.findUniqueOrThrow({ where: { accountHash: f.accountHash } });
    assert.deepEqual(row.credentialIds, [f.credential.id]); assert.deepEqual(row.workspaceIds, [f.workspace.id]);
    assert.deepEqual(row.oldestDataAt, oldest); assert.equal(row.coverageReviewedAt, null);
    await f.service.discover(f.user.id);
    assert.equal((await f.db.jiraPrivacyAccount.findUniqueOrThrow({ where: { accountHash: f.accountHash } })).credentialIds.length, 1);
  } finally { await f.cleanup(); }
});
