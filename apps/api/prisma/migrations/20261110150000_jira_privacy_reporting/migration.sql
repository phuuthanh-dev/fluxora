CREATE TABLE "JiraPrivacyAccount" (
  "accountHash" TEXT NOT NULL,
  "encryptedAccountId" TEXT NOT NULL,
  "oldestDataAt" TIMESTAMP(3) NOT NULL,
  "nextReportAt" TIMESTAMP(3) NOT NULL,
  "lastReportedAt" TIMESTAMP(3),
  "state" TEXT NOT NULL DEFAULT 'READY',
  "requiredAction" TEXT,
  "claimedAt" TIMESTAMP(3),
  "claimToken" TEXT,
  "lastErrorCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraPrivacyAccount_pkey" PRIMARY KEY ("accountHash")
);
CREATE INDEX "JiraPrivacyAccount_state_nextReportAt_idx" ON "JiraPrivacyAccount"("state", "nextReportAt");
