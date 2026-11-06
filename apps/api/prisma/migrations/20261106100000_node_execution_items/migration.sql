CREATE TABLE "NodeExecutionItem" (
  "id" TEXT NOT NULL,
  "nodeExecutionId" TEXT NOT NULL,
  "itemIndex" INTEGER NOT NULL,
  "parentNodeId" TEXT,
  "parentItemIndex" INTEGER,
  "status" "NodeExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "input" JSONB,
  "output" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "errorRetryable" BOOLEAN,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "NodeExecutionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NodeExecutionItem_nodeExecutionId_itemIndex_key"
  ON "NodeExecutionItem"("nodeExecutionId", "itemIndex");

ALTER TABLE "NodeExecutionItem" ADD CONSTRAINT "NodeExecutionItem_nodeExecutionId_fkey"
  FOREIGN KEY ("nodeExecutionId") REFERENCES "NodeExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
