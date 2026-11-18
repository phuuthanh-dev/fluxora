CREATE TABLE "ShopifyInstallation" (
  "shop" TEXT NOT NULL,
  "encryptedData" TEXT,
  "credentialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "workspaceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopifyInstallation_pkey" PRIMARY KEY ("shop")
);

ALTER TABLE "Credential" ADD COLUMN "shopifyInstallationShop" TEXT;
CREATE INDEX "Credential_shopifyInstallationShop_idx" ON "Credential"("shopifyInstallationShop");
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_shopifyInstallationShop_fkey"
  FOREIGN KEY ("shopifyInstallationShop") REFERENCES "ShopifyInstallation"("shop")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ShopifyPrivacyRequest" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "encryptedPayload" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ShopifyPrivacyRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopifyPrivacyRequest_resolvedAt_createdAt_idx" ON "ShopifyPrivacyRequest"("resolvedAt", "createdAt");
