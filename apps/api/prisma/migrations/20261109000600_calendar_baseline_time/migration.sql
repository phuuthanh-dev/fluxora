ALTER TABLE "CalendarTriggerCheckpoint" ADD COLUMN "baselineAt" TIMESTAMP(3);
UPDATE "CalendarTriggerCheckpoint" AS c SET "baselineAt" = COALESCE(w."activatedAt", c."updatedAt") FROM "Workflow" AS w WHERE w.id = c."workflowId";
ALTER TABLE "CalendarTriggerCheckpoint" ALTER COLUMN "baselineAt" SET NOT NULL;
