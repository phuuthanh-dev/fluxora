CREATE TABLE "ProviderPollCheckpoint" (
  "workflowId" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "workflowVersionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL, "configHash" TEXT NOT NULL, "cursor" TEXT NOT NULL,
  "baselineAt" TIMESTAMP(3) NOT NULL, "state" TEXT NOT NULL DEFAULT 'READY',
  "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "nextPollAt" TIMESTAMP(3),
  "lastErrorCode" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderPollCheckpoint_pkey" PRIMARY KEY ("workflowId", "nodeId"),
  CONSTRAINT "ProviderPollCheckpoint_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProviderPollCheckpoint_state_nextPollAt_leaseExpiresAt_idx" ON "ProviderPollCheckpoint"("state", "nextPollAt", "leaseExpiresAt");
CREATE TABLE "ProviderPollDelivery" (
  "workflowId" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "changeKey" TEXT NOT NULL,
  "executionId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderPollDelivery_pkey" PRIMARY KEY ("workflowId", "nodeId", "changeKey"),
  CONSTRAINT "ProviderPollDelivery_workflowId_nodeId_fkey" FOREIGN KEY ("workflowId", "nodeId") REFERENCES "ProviderPollCheckpoint"("workflowId", "nodeId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProviderPollDelivery_executionId_key" ON "ProviderPollDelivery"("executionId");
