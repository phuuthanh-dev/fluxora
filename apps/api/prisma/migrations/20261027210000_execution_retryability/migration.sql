ALTER TABLE "Execution"
  ADD COLUMN "errorRetryable" BOOLEAN;

ALTER TABLE "NodeExecution"
  ADD COLUMN "errorRetryable" BOOLEAN;
