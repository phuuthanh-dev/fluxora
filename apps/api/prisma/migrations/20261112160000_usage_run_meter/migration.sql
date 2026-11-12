-- A run is recorded in the same database transaction as its first live start.
-- No execution foreign key: retention must not erase usage accounting.
CREATE TABLE "UsageRun" (
  "executionId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageRun_pkey" PRIMARY KEY ("executionId"),
  CONSTRAINT "UsageRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UsageRun_workspaceId_startedAt_idx" ON "UsageRun"("workspaceId", "startedAt");
CREATE TABLE "UsageMeter" ("id" TEXT NOT NULL PRIMARY KEY, "startedAt" TIMESTAMP(3) NOT NULL);
INSERT INTO "UsageMeter" ("id", "startedAt") VALUES ('primary', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE FUNCTION record_live_usage_run() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mode = 'LIVE' AND NEW."startedAt" IS NOT NULL AND
     (TG_OP = 'INSERT' OR OLD."startedAt" IS NULL) THEN
    INSERT INTO "UsageRun" ("executionId", "workspaceId", "startedAt")
    SELECT NEW.id, w."workspaceId", NEW."startedAt"
      FROM "WorkflowVersion" v JOIN "Workflow" w ON w.id = v."workflowId"
      WHERE v.id = NEW."workflowVersionId"
    ON CONFLICT ("executionId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER usage_run_insert AFTER INSERT ON "Execution" FOR EACH ROW EXECUTE FUNCTION record_live_usage_run();
CREATE TRIGGER usage_run_start AFTER UPDATE OF "startedAt" ON "Execution" FOR EACH ROW EXECUTE FUNCTION record_live_usage_run();
