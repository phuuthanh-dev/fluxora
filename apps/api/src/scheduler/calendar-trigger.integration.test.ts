import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CalendarTriggerService, calendarTargets } from "./calendar-trigger.service";
import { calendarSyncPage } from "./calendar-trigger-protocol";
import { WorkflowService } from "../workflows/workflow.service";
import { NodeFailure } from "../execution/node-failure";

test("Calendar checkpoint commits pages, delivers each new event once and requires an explicit reset after expiry", { skip: process.env.FLUXORA_RSS_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Calendar integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `calendar-owner-${suffix}`, workspaceId = `calendar-space-${suffix}`, workflowId = `calendar-flow-${suffix}`, versionId = `calendar-version-${suffix}`, credentialId = `calendar-credential-${suffix}`;
  const graph = { nodes: [{ id: "calendar", type: "trigger.google-calendar.event" as const, position: { x: 0, y: 0 }, config: { credentialId, calendarId: "primary", event: "created", pollMinutes: "5" } }], edges: [] };
  const event = (id: string, etag: string, created = new Date().toISOString()) => ({ id, etag, status: "confirmed", created, summary: "Synthetic event", start: "", end: "", updated: "" });
  let page = { events: [event("baseline", "r1")], nextPage: null as string | null, nextSync: "sync1" as string | null };
  let expired = false;
  const dispatched: string[] = [];
  class CalendarFixture extends CalendarTriggerService {
    protected override readonly syncPage: typeof calendarSyncPage = async () => { if (expired) throw new NodeFailure("CALENDAR_SYNC_EXPIRED", "Expired", false); return page; };
  }
  const calendar = new CalendarFixture(prisma as never, { readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as never, { ensureDispatched: async ({ executionId }: { executionId: string }) => { dispatched.push(executionId); } } as never);
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `calendar-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.credential.create({ data: { id: credentialId, workspaceId, provider: "GOOGLE_CALENDAR", label: "Synthetic", encryptedData: "synthetic" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    const workflow = new WorkflowService(prisma as never, {} as never, undefined, undefined, calendar);
    await workflow.activate(workflowId, userId);
    const target = calendarTargets(workflowId, versionId, workspaceId, graph)[0]!;
    page = { events: [event("old-not-in-baseline", "r1", "2020-01-01T00:00:00Z"), event("new", "r1")], nextPage: "next", nextSync: null };
    await calendar.poll(target);
    let checkpoint = await prisma.calendarTriggerCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "calendar" } } });
    assert.equal(checkpoint.syncToken, "sync1"); assert.equal(checkpoint.pageToken, "next"); assert.equal(dispatched.length, 1);
    await prisma.calendarTriggerCheckpoint.update({ where: { workflowId_nodeId: { workflowId, nodeId: "calendar" } }, data: { nextPollAt: null } });
    page = { events: [event("new", "r1")], nextPage: null, nextSync: "sync2" };
    await calendar.poll(target);
    checkpoint = await prisma.calendarTriggerCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "calendar" } } });
    assert.equal(checkpoint.syncToken, "sync2"); assert.equal(checkpoint.pageToken, null); assert.equal(dispatched.length, 1);
    await prisma.calendarTriggerCheckpoint.update({ where: { workflowId_nodeId: { workflowId, nodeId: "calendar" } }, data: { nextPollAt: null } });
    expired = true; await calendar.poll(target);
    checkpoint = await prisma.calendarTriggerCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "calendar" } } });
    assert.equal(checkpoint.state, "ERROR"); assert.equal(checkpoint.syncToken, "sync2");
    await workflow.deactivate(workflowId, userId);
    await assert.rejects(workflow.resetCalendarTrigger(workflowId, userId, false));
    expired = false; page = { events: [], nextPage: null, nextSync: "sync3" };
    await workflow.resetCalendarTrigger(workflowId, userId, true);
    checkpoint = await prisma.calendarTriggerCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "calendar" } } });
    assert.equal(checkpoint.syncToken, "sync3"); assert.equal(checkpoint.state, "READY");
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
