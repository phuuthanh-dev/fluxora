CREATE TABLE "RssTriggerCheckpoint" (
  "workflowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "feedUrlHash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "etag" TEXT,
  "lastModified" TEXT,
  "state" TEXT NOT NULL DEFAULT 'READY',
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextPollAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RssTriggerCheckpoint_pkey" PRIMARY KEY ("workflowId", "nodeId"),
  CONSTRAINT "RssTriggerCheckpoint_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RssTriggerCheckpoint_state_nextPollAt_leaseExpiresAt_idx" ON "RssTriggerCheckpoint"("state", "nextPollAt", "leaseExpiresAt");

CREATE TABLE "RssTriggerDelivery" (
  "workflowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executionId" TEXT,
  CONSTRAINT "RssTriggerDelivery_pkey" PRIMARY KEY ("workflowId", "nodeId", "itemKey"),
  CONSTRAINT "RssTriggerDelivery_workflowId_nodeId_fkey" FOREIGN KEY ("workflowId", "nodeId") REFERENCES "RssTriggerCheckpoint"("workflowId", "nodeId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RssTriggerDelivery_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RssTriggerDelivery_executionId_key" ON "RssTriggerDelivery"("executionId");
CREATE INDEX "RssTriggerDelivery_lastSeenAt_idx" ON "RssTriggerDelivery"("lastSeenAt");
