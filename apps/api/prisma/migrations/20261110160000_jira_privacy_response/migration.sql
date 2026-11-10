ALTER TABLE "JiraPrivacyAccount"
  ADD COLUMN "credentialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "workspaceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "coverageReviewedAt" TIMESTAMP(3);

ALTER TABLE "Execution" ADD COLUMN "privacyErasedAt" TIMESTAMP(3);
