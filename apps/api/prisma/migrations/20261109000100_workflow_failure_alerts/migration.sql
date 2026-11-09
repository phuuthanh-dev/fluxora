ALTER TABLE "Workflow" ADD COLUMN "failureAlertProvider" TEXT, ADD COLUMN "failureAlertCredentialId" TEXT, ADD COLUMN "failureAlertChatId" TEXT;
ALTER TABLE "Execution" ADD COLUMN "failureAlertClaimedAt" TIMESTAMP(3);
ALTER TABLE "RssTriggerCheckpoint" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
