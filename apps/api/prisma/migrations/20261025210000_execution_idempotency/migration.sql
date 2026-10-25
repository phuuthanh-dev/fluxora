ALTER TABLE "Execution"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Execution_idempotencyKey_key" ON "Execution"("idempotencyKey");
