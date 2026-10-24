ALTER TABLE "Execution" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'LIVE';
CREATE INDEX "ApprovalRequest_executionId_status_idx" ON "ApprovalRequest"("executionId", "status");
