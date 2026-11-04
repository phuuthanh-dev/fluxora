ALTER TYPE "CredentialProvider" ADD VALUE IF NOT EXISTS 'RIOT';
CREATE TABLE "RiotApiGuard" (
    "id" TEXT NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RiotApiGuard_pkey" PRIMARY KEY ("id")
);
