ALTER TABLE "PaymentOrder" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'PAYOS', ADD COLUMN "providerNonceHash" TEXT, ADD COLUMN "providerOrderId" TEXT, ADD COLUMN "providerRefundedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");
