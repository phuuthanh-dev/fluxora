CREATE TABLE "CalendarTriggerCheckpoint" (
  "workflowId" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "workflowVersionId" TEXT NOT NULL,
  "configHash" TEXT NOT NULL, "syncToken" TEXT NOT NULL, "pageToken" TEXT,
  "state" TEXT NOT NULL DEFAULT 'READY', "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3),
  "nextPollAt" TIMESTAMP(3), "lastErrorCode" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarTriggerCheckpoint_pkey" PRIMARY KEY ("workflowId", "nodeId"),
  CONSTRAINT "CalendarTriggerCheckpoint_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CalendarTriggerCheckpoint_state_nextPollAt_leaseExpiresAt_idx" ON "CalendarTriggerCheckpoint"("state", "nextPollAt", "leaseExpiresAt");
CREATE TABLE "CalendarTriggerSeen" (
  "workflowId" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "revisionHash" TEXT NOT NULL,
  CONSTRAINT "CalendarTriggerSeen_pkey" PRIMARY KEY ("workflowId", "nodeId", "eventKey"),
  CONSTRAINT "CalendarTriggerSeen_checkpoint_fkey" FOREIGN KEY ("workflowId", "nodeId") REFERENCES "CalendarTriggerCheckpoint"("workflowId", "nodeId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "CalendarTriggerDelivery" (
  "workflowId" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "changeKey" TEXT NOT NULL, "executionId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarTriggerDelivery_pkey" PRIMARY KEY ("workflowId", "nodeId", "changeKey"),
  CONSTRAINT "CalendarTriggerDelivery_checkpoint_fkey" FOREIGN KEY ("workflowId", "nodeId") REFERENCES "CalendarTriggerCheckpoint"("workflowId", "nodeId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CalendarTriggerDelivery_executionId_key" ON "CalendarTriggerDelivery"("executionId");
