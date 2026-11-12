-- Trial metadata is informational; it does not change execution or billing.
ALTER TABLE "Workspace" ADD COLUMN "trialPlan" TEXT, ADD COLUMN "trialExpiresAt" TIMESTAMP(3);
