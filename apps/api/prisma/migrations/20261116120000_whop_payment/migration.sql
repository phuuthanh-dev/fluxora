CREATE TABLE "WhopPayment" (
    "providerOrderId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhopPayment_pkey" PRIMARY KEY ("providerOrderId")
);

CREATE INDEX "WhopPayment_paymentOrderId_status_idx" ON "WhopPayment"("paymentOrderId", "status");
ALTER TABLE "WhopPayment" ADD CONSTRAINT "WhopPayment_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
