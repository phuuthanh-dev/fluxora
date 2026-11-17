import { ExecutionStatus, NodeExecutionStatus, Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import type { WorkflowNode } from "@workflow/contracts";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import type { PrismaService } from "../database/prisma.service";
import { compareHistoricalItems, type HistoricalDeduplicationMode, type HistoricalDeduplicationState } from "./historical-deduplication";
import type { WorkflowItem } from "./item-stream";
import { NodeFailure } from "./node-failure";
import { redactValue } from "./redaction";

const empty = (): HistoricalDeduplicationState => ({ mode: null, hashes: [], maximum: null });

function checkedState(value: Record<string, unknown>): HistoricalDeduplicationState {
  if (![null, "new", "higher", "later"].includes(value.mode as never) || !Array.isArray(value.hashes) || value.hashes.length > 10000 || value.hashes.some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) || (value.maximum !== null && (typeof value.maximum !== "number" || !Number.isFinite(value.maximum)))) {
    throw new NodeFailure("DEDUP_HISTORY_INVALID", "The duplicate history could not be read.", false);
  }
  return { mode: value.mode as HistoricalDeduplicationMode | null, hashes: value.hashes as string[], maximum: value.maximum as number | null };
}

/** Serialize history and the execution receipt together; mock runs never change live history. */
export async function historicalDeduplicate(prisma: PrismaService, workflowId: string, executionId: string, runToken: string, node: WorkflowNode, items: WorkflowItem[], mock: boolean, finishNode = false): Promise<WorkflowItem[] | null> {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new NodeFailure("ENCRYPTION_KEY_REQUIRED", "Application encryption is not configured.", false);
  const config = node.config;
  const scope = config.historyScope === "workflow" ? "workflow" : `node:${node.id}`;
  const scopedKey = createHmac("sha256", key).update("fluxora-dedup-scope\0").update(JSON.stringify([workflowId, scope])).digest();
  const fields = String(config.historyFields ?? "").split(",").map((field) => field.trim());
  const mode = (config.historyMode ?? "new") as HistoricalDeduplicationMode;
  const limit = Number(config.historySize ?? 10000);
  const clear = config.operation === "clear";
  if (mock) return clear ? items : compareHistoricalItems(items, fields, mode, empty(), limit, scopedKey).keptIndexes.map((index) => items[index]!);

  const inputDigest = createHmac("sha256", scopedKey).update("receipt\0").update(JSON.stringify([node.config, items])).digest("hex");
  const vault = new CredentialVaultService();
  return prisma.$transaction(async (tx) => {
    // Workflow lock serializes every node sharing history and prevents races
    // between concurrent executions, publication, and workflow deletion.
    const workflows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
    if (!workflows.length) return null;
    const executions = await tx.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
    if (executions[0]?.status !== ExecutionStatus.RUNNING || executions[0].runToken !== runToken) return null;
    const receipt = await tx.deduplicationReceipt.findUnique({ where: { executionId_nodeId: { executionId, nodeId: node.id } } });
    if (receipt) {
      if (receipt.inputDigest !== inputDigest || !Array.isArray(receipt.keptIndexes) || receipt.keptIndexes.some((index) => typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= items.length)) {
        throw new NodeFailure("DEDUP_REPLAY_INVALID", "The duplicate comparison could not be safely resumed.", false);
      }
      return (receipt.keptIndexes as number[]).map((index) => items[index]!);
    }
    const current = await tx.deduplicationHistory.findUnique({ where: { workflowId_scopeKey: { workflowId, scopeKey: scope } } });
    const result = clear ? { keptIndexes: items.map((_, index) => index), history: empty() } : compareHistoricalItems(items, fields, mode, current ? checkedState(vault.decrypt(current.encryptedState)) : empty(), limit, scopedKey);
    if (clear) await tx.deduplicationHistory.deleteMany({ where: { workflowId, scopeKey: scope } });
    else await tx.deduplicationHistory.upsert({ where: { workflowId_scopeKey: { workflowId, scopeKey: scope } }, create: { workflowId, scopeKey: scope, encryptedState: vault.encrypt(result.history) }, update: { encryptedState: vault.encrypt(result.history) } });
    await tx.deduplicationReceipt.create({ data: { executionId, nodeId: node.id, inputDigest, keptIndexes: result.keptIndexes as Prisma.InputJsonValue } });
    if (finishNode) {
      // A worker interruption must never commit history while leaving the node
      // incomplete. This is a pure transform, so persist its result together
      // with history, under the same execution lease.
      const selected = result.keptIndexes.map((index) => items[index]!);
      const completedAt = new Date();
      const record = await tx.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId, nodeId: node.id } }, select: { id: true } });
      await tx.nodeExecutionItem.createMany({ data: selected.map((item, itemIndex) => ({ nodeExecutionId: record.id, itemIndex, parentNodeId: item.pairedItem?.nodeId ?? null, parentItemIndex: item.pairedItem?.itemIndex ?? null, status: NodeExecutionStatus.SUCCEEDED, attempt: 1, input: redactValue({ item: item.json, config: node.config, ...(item.sources ? { sources: item.sources } : {}) }) as Prisma.InputJsonValue, output: redactValue(item.json) as Prisma.InputJsonValue, startedAt: completedAt, completedAt })) });
      await tx.nodeExecution.update({ where: { id: record.id }, data: { status: NodeExecutionStatus.SUCCEEDED, attempt: 1, input: redactValue({ items: items.map((item) => item.json) }) as Prisma.InputJsonValue, output: redactValue({ items: selected.map((item) => item.json), count: selected.length }) as Prisma.InputJsonValue, startedAt: completedAt, completedAt } });
    }
    return result.keptIndexes.map((index) => items[index]!);
  });
}
