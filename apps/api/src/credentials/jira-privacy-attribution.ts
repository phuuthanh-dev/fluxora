import { ConflictException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CredentialVaultService } from "./credential-vault.service";

export function jiraAccountHash(accountId: string) {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) throw new Error("Encryption key required");
  return createHmac("sha256", Buffer.from(key, "base64")).update("jira-privacy-account\0").update(accountId).digest("hex");
}

/** Keep links after a credential is deleted; do not rewrite the oldest observation. */
export async function trackJiraConnection(tx: Prisma.TransactionClient, vault: CredentialVaultService, accountId: string, credentialId: string, workspaceId: string) {
  const accountHash = jiraAccountHash(accountId), now = new Date();
  await tx.jiraPrivacyAccount.upsert({ where: { accountHash }, create: { accountHash, encryptedAccountId: vault.encrypt({ accountId }), oldestDataAt: now, nextReportAt: now, credentialIds: [credentialId], workspaceIds: [workspaceId], coverageReviewedAt: now }, update: {} });
  const rows = await tx.$queryRaw<Array<{ state: string }>>`SELECT state FROM "JiraPrivacyAccount" WHERE "accountHash" = ${accountHash} FOR UPDATE`;
  if (rows[0]?.state === "ACTION_REQUIRED") throw new ConflictException({ code: "JIRA_PRIVACY_ACTION_REQUIRED", message: "An administrator must resolve a Jira data request before reconnecting this account." });
  await tx.jiraPrivacyAccount.updateMany({ where: { accountHash, NOT: { credentialIds: { has: credentialId } } }, data: { credentialIds: { push: credentialId } } });
  await tx.jiraPrivacyAccount.updateMany({ where: { accountHash, NOT: { workspaceIds: { has: workspaceId } } }, data: { workspaceIds: { push: workspaceId } } });
}
