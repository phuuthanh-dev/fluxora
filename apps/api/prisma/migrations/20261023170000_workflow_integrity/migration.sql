-- Preserve the workflow/version invariants required by the runner before
-- workflow data is introduced outside local development.
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

ALTER TABLE "ApprovalRequest" ADD COLUMN "status_next" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING';
UPDATE "ApprovalRequest"
SET "status_next" = CASE "status"
  WHEN 'APPROVED' THEN 'APPROVED'::"ApprovalRequestStatus"
  WHEN 'REJECTED' THEN 'REJECTED'::"ApprovalRequestStatus"
  WHEN 'EXPIRED' THEN 'EXPIRED'::"ApprovalRequestStatus"
  ELSE 'PENDING'::"ApprovalRequestStatus"
END;
ALTER TABLE "ApprovalRequest" DROP COLUMN "status";
ALTER TABLE "ApprovalRequest" RENAME COLUMN "status_next" TO "status";

ALTER TABLE "WebhookEndpoint" ADD COLUMN "workflowVersionId" TEXT;
UPDATE "WebhookEndpoint" AS endpoint
SET "workflowVersionId" = COALESCE(workflow."publishedVersionId", workflow."draftVersionId")
FROM "Workflow" AS workflow
WHERE workflow.id = endpoint."workflowId";
ALTER TABLE "WebhookEndpoint" ALTER COLUMN "workflowVersionId" SET NOT NULL;

CREATE TABLE "WorkflowTemplate" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "graph" JSONB NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowTemplate_slug_key" ON "WorkflowTemplate"("slug");
CREATE INDEX "WebhookEndpoint_workflowVersionId_idx" ON "WebhookEndpoint"("workflowVersionId");
CREATE UNIQUE INDEX "Workflow_draftVersionId_key" ON "Workflow"("draftVersionId");
CREATE UNIQUE INDEX "Workflow_publishedVersionId_key" ON "Workflow"("publishedVersionId");

ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_draftVersionId_fkey"
  FOREIGN KEY ("draftVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workflowVersionId_fkey"
  FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
