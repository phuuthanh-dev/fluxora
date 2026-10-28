CREATE TABLE "ExecutionSavedView" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionSavedView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExecutionSavedView_workspaceId_userId_name_key" ON "ExecutionSavedView"("workspaceId", "userId", "name");
CREATE INDEX "ExecutionSavedView_workspaceId_userId_idx" ON "ExecutionSavedView"("workspaceId", "userId");
ALTER TABLE "ExecutionSavedView" ADD CONSTRAINT "ExecutionSavedView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionSavedView" ADD CONSTRAINT "ExecutionSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
