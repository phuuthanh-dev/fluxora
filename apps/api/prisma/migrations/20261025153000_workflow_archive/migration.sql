ALTER TABLE "Workflow" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Workflow_workspaceId_archivedAt_updatedAt_idx" ON "Workflow"("workspaceId", "archivedAt", "updatedAt");
