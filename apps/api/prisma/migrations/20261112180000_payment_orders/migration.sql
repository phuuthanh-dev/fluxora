ALTER TABLE "Workspace" ADD COLUMN "paidPlan" TEXT, ADD COLUMN "paidUntil" TIMESTAMP(3);

CREATE TABLE "PaymentOrder" (
  "id" TEXT NOT NULL,
  "orderCode" BIGSERIAL NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "paymentLinkId" TEXT,
  "checkoutUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentOrder_orderCode_key" ON "PaymentOrder"("orderCode");
CREATE UNIQUE INDEX "PaymentOrder_paymentLinkId_key" ON "PaymentOrder"("paymentLinkId");
CREATE INDEX "PaymentOrder_workspaceId_createdAt_idx" ON "PaymentOrder"("workspaceId", "createdAt");
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
