import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { CredentialService } from "./credential.service";
import { ExecutionService } from "../execution/execution.service";
import { WorkflowService } from "../workflows/workflow.service";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// Pause after the real PostgreSQL row lock, leaving another transaction to race it.
function pauseAfterCredentialLock(prisma: PrismaClient, locked: () => void, release: Promise<void>) {
  return new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(async (tx) => {
        const wrapped = new Proxy(tx, {
          get(inner, key) {
            if (key === "$queryRaw") return async (...args: Parameters<Prisma.TransactionClient["$queryRaw"]>) => {
              const result = await inner.$queryRaw(...args);
              if (String(args[0]).includes('"Credential"')) { locked(); await release; }
              return result;
            };
            const value = Reflect.get(inner, key);
            return typeof value === "function" ? value.bind(inner) : value;
          },
        });
        return callback(wrapped);
      });
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function assertPending(promise: Promise<unknown>) {
  const result = await Promise.race([promise.then(() => "settled", () => "settled"), new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100))]);
  assert.equal(result, "pending", "competing transaction should wait for the credential lock");
}

function code(error: unknown) {
  return typeof error === "object" && error !== null && "response" in error ? (error.response as { code?: string }).code : undefined;
}

test("credential deletion serializes with workflow saves and historical live retries", { skip: process.env.FLUXORA_CREDENTIAL_INTEGRATION !== "1", timeout: 30_000 }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Credential integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `cred-owner-${suffix}`, workspaceId = `cred-workspace-${suffix}`, workflowId = `cred-workflow-${suffix}`, draftId = `cred-draft-${suffix}`, oldId = `cred-version-${suffix}`, credentialId = `cred-${suffix}`;
  const emptyGraph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] };
  const withCredential = { nodes: [...emptyGraph.nodes, { id: "steam", type: "action.steam.account-snapshot", position: { x: 1, y: 1 }, config: { credentialId } }], edges: [] };
  const owner = { requireOwner: async () => {} };
  const createCredential = () => prisma.credential.create({ data: { id: credentialId, workspaceId, provider: "STEAM", label: "Test Steam", encryptedData: "not-a-secret" } });
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `cred-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: draftId, workflowId, version: 1, status: "DRAFT", graph: emptyGraph } });
    await prisma.workflowVersion.create({ data: { id: oldId, workflowId, version: 2, status: "PUBLISHED", graph: withCredential } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { draftVersionId: draftId } });
    await createCredential();

    // A committed save must make a waiting deletion report its workflow use.
    let locked = deferred(), release = deferred();
    let wrapped = pauseAfterCredentialLock(prisma, locked.resolve, release.promise);
    let workflow = new WorkflowService(wrapped as never, owner as never);
    let credentials = new CredentialService(prisma as never, owner as never, {} as never);
    const saving = workflow.updateDraft(workflowId, userId, { graph: withCredential });
    await locked.promise;
    let deletion = credentials.delete(workspaceId, credentialId, userId);
    await assertPending(deletion);
    release.resolve();
    await saving;
    await assert.rejects(deletion, (error: unknown) => code(error) === "CREDENTIAL_IN_USE");

    // If deletion wins, a stale editor cannot save a missing credential ID.
    await workflow.updateDraft(workflowId, userId, { graph: emptyGraph });
    locked = deferred(); release = deferred();
    wrapped = pauseAfterCredentialLock(prisma, locked.resolve, release.promise);
    credentials = new CredentialService(wrapped as never, owner as never, {} as never);
    workflow = new WorkflowService(prisma as never, owner as never);
    deletion = credentials.delete(workspaceId, credentialId, userId);
    await locked.promise;
    const staleSave = workflow.updateDraft(workflowId, userId, { graph: withCredential });
    await assertPending(staleSave);
    release.resolve();
    await deletion;
    await assert.rejects(staleSave, (error: unknown) => code(error) === "CREDENTIAL_REFERENCE_NOT_FOUND");

    // Retrying an old failed version must either keep the credential or fail.
    await createCredential();
    await prisma.execution.create({ data: { id: `failed-${suffix}`, workflowVersionId: oldId, status: "FAILED", mode: "LIVE" } });
    locked = deferred(); release = deferred();
    wrapped = pauseAfterCredentialLock(prisma, locked.resolve, release.promise);
    const executions = new ExecutionService(wrapped as never, {} as never, {} as never);
    credentials = new CredentialService(prisma as never, owner as never, {} as never);
    const retry = executions.retry(`failed-${suffix}`, userId);
    await locked.promise;
    deletion = credentials.delete(workspaceId, credentialId, userId);
    await assertPending(deletion);
    release.resolve();
    const retried = await retry;
    await assert.rejects(deletion, (error: unknown) => code(error) === "CREDENTIAL_IN_USE");

    // When deletion wins after readiness was checked, retry must recheck under lock.
    await prisma.execution.update({ where: { id: retried.id }, data: { status: "CANCELLED" } });
    locked = deferred(); release = deferred();
    wrapped = pauseAfterCredentialLock(prisma, locked.resolve, release.promise);
    credentials = new CredentialService(wrapped as never, owner as never, {} as never);
    deletion = credentials.delete(workspaceId, credentialId, userId);
    await locked.promise;
    const lateRetry = new ExecutionService(prisma as never, {} as never, {} as never).retry(`failed-${suffix}`, userId);
    await assertPending(lateRetry);
    release.resolve();
    await deletion;
    await assert.rejects(lateRetry, (error: unknown) => code(error) === "CREDENTIAL_REFERENCE_NOT_FOUND");
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.credential.deleteMany({ where: { workspaceId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
