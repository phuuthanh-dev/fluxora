ALTER TABLE "Execution" ADD COLUMN "resumeToken" TEXT,
  ADD COLUMN "resumeNodeIds" JSONB,
  ADD COLUMN "resumeQueuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Execution_resumeToken_key" ON "Execution"("resumeToken");
CREATE INDEX "Execution_status_resumeQueuedAt_idx" ON "Execution"("status", "resumeQueuedAt");
