CREATE TABLE "DeduplicationHistory" (
  "workflowId" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "encryptedState" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeduplicationHistory_pkey" PRIMARY KEY ("workflowId", "scopeKey"),
  CONSTRAINT "DeduplicationHistory_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DeduplicationReceipt" (
  "executionId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "inputDigest" TEXT NOT NULL,
  "keptIndexes" JSONB NOT NULL,
  CONSTRAINT "DeduplicationReceipt_pkey" PRIMARY KEY ("executionId", "nodeId"),
  CONSTRAINT "DeduplicationReceipt_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
