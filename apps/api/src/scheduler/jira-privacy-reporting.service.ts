import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { CredentialService } from "../credentials/credential.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { reportJiraPrivacyAccount } from "../credentials/jira-privacy-report";
import { PrismaService } from "../database/prisma.service";
import { BackgroundWork } from "../platform/background-work";

@Injectable()
export class JiraPrivacyReportingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JiraPrivacyReportingService.name);
  private readonly background = new BackgroundWork();
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService, @Inject(CredentialVaultService) private readonly vault: CredentialVaultService) {}

  onModuleInit() {
    // This switch is intentionally off until the owner reviews the erasure process.
    if (process.env.JIRA_PRIVACY_REPORTING_ENABLED !== "true" || process.env.SCHEDULER_ENABLED === "false" || process.env.PROCESS_ROLE === "worker") return;
    if (!process.env.JIRA_REPORTING_WORKSPACE_ID || !process.env.JIRA_REPORTING_CREDENTIAL_ID) { this.logger.error("Jira privacy reporting owner connection is not configured."); return; }
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Jira privacy reporting scan failed."));
    scan(); this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

  async tick() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      // A request may have reached Atlassian before a crash: require review, never blindly repeat it.
      await this.prisma.jiraPrivacyAccount.updateMany({ where: { state: "PROCESSING", claimedAt: { lt: new Date(Date.now() - 120_000) } }, data: { state: "UNCERTAIN", lastErrorCode: "INTERRUPTED", claimToken: null, claimedAt: null } });
      const pending = await this.prisma.jiraPrivacyAccount.findMany({ where: { state: "READY", nextReportAt: { lte: new Date() } }, orderBy: { nextReportAt: "asc" }, take: 30 });
      for (const item of pending) await this.report(item.accountHash);
    } finally { this.scanning = false; }
  }

  private async report(accountHash: string) {
    const claimToken = randomUUID(), now = new Date();
    const claimed = await this.prisma.jiraPrivacyAccount.updateMany({ where: { accountHash, state: "READY", nextReportAt: { lte: now } }, data: { state: "PROCESSING", claimedAt: now, claimToken } });
    if (!claimed.count) return;
    try {
      const item = await this.prisma.jiraPrivacyAccount.findUniqueOrThrow({ where: { accountHash } });
      const accountId = this.vault.decrypt(item.encryptedAccountId).accountId;
      const workspaceId = process.env.JIRA_REPORTING_WORKSPACE_ID!, credentialId = process.env.JIRA_REPORTING_CREDENTIAL_ID!;
      const result = await this.credentials.runJiraOperation(credentialId, workspaceId, async () => {
        const connection = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.JIRA);
        if (typeof accountId !== "string" || typeof connection.accessToken !== "string") throw new Error("INVALID_CONNECTION");
        return reportJiraPrivacyAccount(connection.accessToken, accountId, item.oldestDataAt);
      });
      const data = "retrySeconds" in result
        ? { state: "READY", nextReportAt: new Date(Date.now() + result.retrySeconds * 1000), lastErrorCode: "RATE_LIMITED", claimedAt: null, claimToken: null }
        : { state: result.action ? "ACTION_REQUIRED" : "READY", requiredAction: result.action, lastReportedAt: new Date(), nextReportAt: new Date(Date.now() + result.cycleDays * 86400_000), lastErrorCode: null, claimedAt: null, claimToken: null };
      await this.prisma.jiraPrivacyAccount.updateMany({ where: { accountHash, state: "PROCESSING", claimToken }, data });
    } catch {
      await this.prisma.jiraPrivacyAccount.updateMany({ where: { accountHash, state: "PROCESSING", claimToken }, data: { state: "UNCERTAIN", lastErrorCode: "REPORT_NOT_CONFIRMED", claimedAt: null, claimToken: null } });
      this.logger.warn("Jira privacy report requires operator review.");
    }
  }
}
