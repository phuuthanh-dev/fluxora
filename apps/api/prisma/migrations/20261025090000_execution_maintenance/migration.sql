ALTER TABLE "Execution"
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "recoveryCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Execution_status_leaseExpiresAt_idx" ON "Execution"("status", "leaseExpiresAt");
