import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CredentialProvider, ProviderWebhookState } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "../credentials/credential.service";
import { BackgroundWork } from "../platform/background-work";
import { JiraWebhookAdapter, type JiraIssueEvent } from "./jira-webhook-adapter";

const SCAN_INTERVAL = 6 * 60 * 60 * 1000;
const RENEW_AFTER = 20 * 24 * 60 * 60 * 1000;

/** Atlassian dynamic webhooks expire even when no events are received. */
@Injectable()
export class JiraWebhookRenewalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JiraWebhookRenewalService.name);
  private readonly background = new BackgroundWork();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private cursor = "";
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService, @Inject(JiraWebhookAdapter) private readonly adapter: JiraWebhookAdapter) {}

  onModuleInit() {
    if (process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED !== "true" || process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Jira webhook renewal scan failed."));
    scan();
    this.timer = setInterval(scan, SCAN_INTERVAL);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.background.drain();
  }

  async renewDue(now = new Date()) {
    const before = new Date(now.getTime() - RENEW_AFTER);
    const candidates = await this.prisma.providerWebhookRegistration.findMany({ where: { provider: "JIRA", state: ProviderWebhookState.ACTIVE, updatedAt: { lt: before }, ...(this.cursor ? { id: { gt: this.cursor } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: 50 });
    for (const candidate of candidates) {
      try { await this.renew(candidate.id, before); }
      catch { this.logger.warn(`Jira webhook ${candidate.id} could not be renewed; it will be retried.`); }
    }
    this.cursor = candidates.length === 50 ? candidates[candidates.length - 1]!.id : "";
  }

  private async renew(id: string, before: Date) {
    await this.prisma.$transaction(async (tx) => {
      // Serialize renewal with delete/reconfiguration; the provider call is
      // bounded and targets only the recorded remote identity.
      await tx.$queryRaw`SELECT id FROM "ProviderWebhookRegistration" WHERE id = ${id} FOR UPDATE`;
      const registration = await tx.providerWebhookRegistration.findFirst({ where: { id, provider: "JIRA", state: ProviderWebhookState.ACTIVE, updatedAt: { lt: before } }, include: { endpoint: { include: { workflow: { select: { workspaceId: true, publishedVersionId: true, archivedAt: true } } } } } });
      if (!registration || registration.remoteHookId === null || registration.endpoint.workflow.archivedAt || registration.endpoint.workflow.publishedVersionId !== registration.workflowVersionId) return;
      const hookId = Number(registration.remoteHookId), [cloudId = "", projectId = ""] = registration.repository.split(":");
      if (!Number.isSafeInteger(hookId) || hookId <= 0) throw new Error("Invalid Jira webhook identity");
      await this.credentials.runJiraOperation(registration.credentialId, registration.endpoint.workflow.workspaceId, async () => {
        const credential = await this.credentials.readForExecution(registration.credentialId, registration.endpoint.workflow.workspaceId, CredentialProvider.JIRA);
        if (credential.cloudId !== cloudId || typeof credential.accessToken !== "string") throw new Error("Jira connection changed");
        const auth = { cloudId, accessToken: credential.accessToken };
        const remote = await this.adapter.inspect(auth, { id: hookId, url: registration.callbackUrl, projectId, event: registration.event as JiraIssueEvent });
        if (!remote.found || !remote.matches) throw new Error("Jira webhook changed");
        await this.adapter.refresh(auth, hookId);
      });
      await tx.providerWebhookRegistration.update({ where: { id: registration.id }, data: { updatedAt: new Date() } });
    }, { maxWait: 5000, timeout: 55_000 });
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.renewDue(); }
    finally { this.running = false; }
  }
}
