CREATE TABLE "LemonPayment" (
    "providerOrderId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LemonPayment_pkey" PRIMARY KEY ("providerOrderId")
);
CREATE INDEX "LemonPayment_paymentOrderId_status_idx" ON "LemonPayment"("paymentOrderId", "status");
ALTER TABLE "LemonPayment" ADD CONSTRAINT "LemonPayment_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
