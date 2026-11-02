-- Additive: old workers ignore this nullable field and no existing row changes.
ALTER TABLE "Execution" ADD COLUMN "webhookPayloadDigest" TEXT;
