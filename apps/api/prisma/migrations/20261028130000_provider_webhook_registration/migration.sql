-- This table is not used by manual registrations. A provider write and the
-- database cannot commit atomically: uncertain writes need reconciliation.
CREATE TYPE "ProviderWebhookState" AS ENUM ('CREATING', 'CREATE_UNCERTAIN', 'CREATE_REJECTED', 'ACTIVE', 'DELETING', 'DELETE_UNCERTAIN', 'REMOVED');

CREATE TABLE "ProviderWebhookRegistration" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "encryptedSigningSecret" TEXT NOT NULL,
    "state" "ProviderWebhookState" NOT NULL,
    "operationId" TEXT NOT NULL,
    "remoteHookId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderWebhookRegistration_pkey" PRIMARY KEY ("id"),
    -- GitHub repository identity is case-insensitive; normalize before writing.
    CONSTRAINT "ProviderWebhookRegistration_github_repository_case_check" CHECK ("provider" <> 'GITHUB' OR "repository" = lower("repository")),
    CONSTRAINT "ProviderWebhookRegistration_remote_identity_check" CHECK ("remoteHookId" IS NULL OR "remoteHookId" > 0),
    CONSTRAINT "ProviderWebhookRegistration_state_identity_check" CHECK (
        ("state" IN ('CREATING', 'CREATE_UNCERTAIN', 'CREATE_REJECTED') AND "remoteHookId" IS NULL)
        OR ("state" IN ('ACTIVE', 'DELETING', 'DELETE_UNCERTAIN') AND "remoteHookId" IS NOT NULL)
        OR "state" = 'REMOVED'
    )
);

CREATE UNIQUE INDEX "ProviderWebhookRegistration_endpointId_key" ON "ProviderWebhookRegistration"("endpointId");
CREATE UNIQUE INDEX "ProviderWebhookRegistration_operationId_key" ON "ProviderWebhookRegistration"("operationId");
CREATE UNIQUE INDEX "ProviderWebhookRegistration_remote_identity_key" ON "ProviderWebhookRegistration"("provider", "repository", "remoteHookId");
CREATE INDEX "ProviderWebhookRegistration_state_updatedAt_idx" ON "ProviderWebhookRegistration"("state", "updatedAt");
ALTER TABLE "ProviderWebhookRegistration" ADD CONSTRAINT "ProviderWebhookRegistration_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderWebhookRegistration" ADD CONSTRAINT "ProviderWebhookRegistration_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderWebhookRegistration" ADD CONSTRAINT "ProviderWebhookRegistration_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
