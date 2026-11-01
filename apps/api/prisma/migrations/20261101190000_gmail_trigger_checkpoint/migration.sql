CREATE TABLE "GmailTriggerCheckpoint" (
    "workflowVersionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "mailboxHash" TEXT NOT NULL,
    "pageToken" TEXT,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GmailTriggerCheckpoint_pkey" PRIMARY KEY ("workflowVersionId", "nodeId")
);
ALTER TABLE "Execution" ADD COLUMN "idempotencyRootId" TEXT;
CREATE INDEX "GmailTriggerCheckpoint_state_leaseExpiresAt_idx" ON "GmailTriggerCheckpoint"("state", "leaseExpiresAt");
ALTER TABLE "GmailTriggerCheckpoint" ADD CONSTRAINT "GmailTriggerCheckpoint_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "GmailTriggerDelivery" (
    "workflowVersionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "executionId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailTriggerDelivery_pkey" PRIMARY KEY ("workflowVersionId", "nodeId", "messageId")
);
ALTER TABLE "GmailTriggerDelivery" ADD CONSTRAINT "GmailTriggerDelivery_checkpoint_fkey" FOREIGN KEY ("workflowVersionId", "nodeId") REFERENCES "GmailTriggerCheckpoint"("workflowVersionId", "nodeId") ON DELETE CASCADE ON UPDATE CASCADE;
