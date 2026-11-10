import { normalizeGitLabEvent, validGitLabSigningToken, verifyGitLabSignature, type GitLabHeaders } from "./gitlab-trigger-protocol";
import { normalizeJiraIssueEvent, verifyJiraBearer } from "./jira-trigger-protocol";
import { type JiraIssueEvent } from "./jira-webhook-adapter";
import { normalizeSlackEvent, readSlackEnvelope, verifySlackSignature } from "./slack-trigger-protocol";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { CredentialProvider } from "@prisma/client";
import { CredentialService } from "../credentials/credential.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { matchesUptimeKumaFilter } from "./uptime-kuma-filter";
import { normalizeTelegramUpdate, telegramTriggerFilterFromConfig, telegramWebhookSecretMatches } from "./telegram-trigger-protocol";
import { normalizeVercelDeployment, vercelTriggerFilterFromConfig, verifyVercelSignature } from "./vercel-trigger-protocol";
import { normalizeTrelloAction, readTrelloCallbackUrl, readTrelloTriggerFilter, verifyTrelloSignature } from "./trello-trigger-protocol";
import { normalizeSentryIssueCreated, readSentryIssueCreatedFilter, verifySentryIntegrationSignature } from "./sentry-trigger-protocol";
import { BackgroundWork } from "../platform/background-work";

@Injectable()
export class WebhookService implements OnModuleDestroy {
  private readonly webhookDispatches = new BackgroundWork();
  private readonly logger = new Logger(WebhookService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(CredentialVaultService) private readonly vault: CredentialVaultService = new CredentialVaultService(),
  ) {}

  async onModuleDestroy() { await this.webhookDispatches.drain(); }

  async getEndpoint(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId: workflow.id } });
    if (!endpoint) return null;
    const isCurrentTrello = workflow.publishedVersion && endpoint.workflowVersionId === workflow.publishedVersion.id && parseStoredWorkflowGraph(workflow.publishedVersion.graph).nodes.some((node) => node.type === "trigger.trello.board-action");
    const stored = isCurrentTrello && endpoint.encryptedSigningSecret ? this.vault.decrypt(endpoint.encryptedSigningSecret) : undefined;
    const callbackUrl = isCurrentTrello && typeof stored?.callbackUrl === "string" ? readTrelloCallbackUrl(stored.callbackUrl, endpoint.path) : undefined;
    return { id: endpoint.id, path: endpoint.path, secretRequired: Boolean(endpoint.secretHash || endpoint.encryptedSigningSecret), signingMode: endpoint.encryptedSigningSecret ? "registration" : "legacy", workflowVersionId: endpoint.workflowVersionId, createdAt: endpoint.createdAt, updatedAt: endpoint.updatedAt, ...(callbackUrl ? { callbackUrl } : {}) };
  }

  async createEndpoint(workflowId: string, userId: string, path: string, secretRequired: boolean, expected: { publishedVersionId: string; endpoint: { id: string; updatedAt: string } | null }, importedSigningSecret?: unknown, importedCallbackUrl?: unknown) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before creating a webhook endpoint." });
    const graph = parseStoredWorkflowGraph(workflow.publishedVersion.graph);
    const githubTrigger = githubWebhookTrigger(graph);
    const kumaTrigger = graph.nodes.some((node) => isUptimeKumaTrigger(node.type));
    const telegramTrigger = graph.nodes.some((node) => node.type === "trigger.telegram.update");
    const vercelTrigger = graph.nodes.some((node) => node.type === "trigger.vercel.deployment");
    const trelloTrigger = graph.nodes.some((node) => node.type === "trigger.trello.board-action");
    const gitlabTrigger = graph.nodes.some((node) => node.type.startsWith("trigger.gitlab."));
    const jiraTrigger = graph.nodes.some((node) => node.type === "trigger.jira.issue");
    const slackTrigger = graph.nodes.some((node) => node.type === "trigger.slack.event");
    const sentryTrigger = graph.nodes.some((node) => node.type === "trigger.sentry.issue-created");
    if (slackTrigger && importedSigningSecret === undefined) {
      importedSigningSecret = process.env.SLACK_SIGNING_SECRET;
      const trigger = graph.nodes.find((node) => node.type === "trigger.slack.event")!;
      const connection = await this.credentials.readForExecution(String(trigger.config.credentialId ?? ""), workflow.workspaceId, CredentialProvider.SLACK_OAUTH);
      if (!process.env.SLACK_APP_ID || connection.appId !== process.env.SLACK_APP_ID || !Array.isArray(connection.grantedScopes) || !connection.grantedScopes.includes(trigger.config.event === "app_mention" ? "app_mentions:read" : "channels:history")) {
        throw new BadRequestException({ code: "SLACK_EVENTS_UNAVAILABLE", message: "Reconnect Slack with trigger access before enabling events." });
      }
    }

    if (!graph.nodes.some((node) => node.type === "trigger.webhook") && !githubTrigger && !kumaTrigger && !telegramTrigger && !vercelTrigger && !trelloTrigger && !sentryTrigger && !slackTrigger && !gitlabTrigger && !jiraTrigger) {
      throw new BadRequestException({ code: "WEBHOOK_TRIGGER_REQUIRED", message: "Publish a workflow version containing a supported webhook trigger before creating an endpoint." });
    }
    const conflictingEndpoint = await this.prisma.webhookEndpoint.findFirst({ where: { path, NOT: { workflowId } } });
    if (conflictingEndpoint) throw new ConflictException({ code: "WEBHOOK_PATH_IN_USE", message: "This webhook path is already in use by another workflow." });
    if (gitlabTrigger && !validGitLabSigningToken(importedSigningSecret)) throw new BadRequestException({ code: "GITLAB_SIGNING_TOKEN_REQUIRED", message: "Enter the signing token generated in GitLab webhook settings (whsec_…)." });
    if ((vercelTrigger || trelloTrigger || sentryTrigger || slackTrigger) && (typeof importedSigningSecret !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(importedSigningSecret))) throw new BadRequestException({ code: vercelTrigger ? "VERCEL_SIGNING_SECRET_REQUIRED" : trelloTrigger ? "TRELLO_SIGNING_SECRET_REQUIRED" : slackTrigger ? "SLACK_SIGNING_SECRET_REQUIRED" : "SENTRY_SIGNING_SECRET_REQUIRED", message: "Enter the provider webhook signing secret." });
    if (!vercelTrigger && !trelloTrigger && !sentryTrigger && !slackTrigger && !gitlabTrigger && importedSigningSecret !== undefined) throw new BadRequestException({ code: "INVALID_INPUT", message: "A provider signing secret is not used by this endpoint." });
    if (!trelloTrigger && importedCallbackUrl !== undefined) throw new BadRequestException({ code: "INVALID_INPUT", message: "A callback URL is not used by this endpoint." });
    const callbackUrl = trelloTrigger ? readTrelloCallbackUrl(importedCallbackUrl, path) : undefined;
    const secret = vercelTrigger || trelloTrigger || sentryTrigger || slackTrigger || gitlabTrigger ? importedSigningSecret as string : githubTrigger || kumaTrigger || telegramTrigger || jiraTrigger || secretRequired ? randomBytes(24).toString("base64url") : null;
    const encryptedSigningSecret = (githubTrigger || vercelTrigger || trelloTrigger || sentryTrigger || slackTrigger || gitlabTrigger || jiraTrigger) && secret ? this.vault.encrypt({ secret, ...(callbackUrl ? { callbackUrl } : {}) }) : null;
    const identitySecret = trelloTrigger ? JSON.stringify([secret, callbackUrl]) : secret;
    const publishedVersionId = workflow.publishedVersion.id;
    const endpoint = await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ publishedVersionId: string | null }>>`SELECT "publishedVersionId" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (locked[0]?.publishedVersionId !== publishedVersionId || expected.publishedVersionId !== publishedVersionId) throw new ConflictException({ code: "WEBHOOK_VERSION_CHANGED", message: "The published workflow changed. Reload before configuring the webhook." });
      const registrations = await transaction.webhookEndpoint.findMany({ where: { workflowId }, take: 2 });
      if (registrations.length > 1) throw new ConflictException({ code: "WEBHOOK_REGISTRATION_DUPLICATE", message: "Multiple webhook registrations exist for this workflow. Resolve them before making changes." });
      const existing = registrations[0];
      if ((existing?.id ?? null) !== (expected.endpoint?.id ?? null) || (existing && existing.updatedAt.toISOString() !== expected.endpoint?.updatedAt)) {
        throw new ConflictException({ code: "WEBHOOK_REGISTRATION_CHANGED", message: "The webhook registration changed. Reload its status before trying again." });
      }
      if (existing && await transaction.providerWebhookRegistration.findUnique({ where: { endpointId: existing.id }, select: { id: true } })) {
        throw new ConflictException({ code: "PROVIDER_WEBHOOK_MANAGED", message: "This endpoint has a provider-managed webhook. Resolve its provider registration before changing the endpoint." });
      }
      const updatedAt = existing ? new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) : undefined;
      const saved = existing
        ? await transaction.webhookEndpoint.update({ where: { id: existing.id }, data: { path, secretHash: !githubTrigger && identitySecret ? hashWebhookSecret(identitySecret) : null, encryptedSigningSecret, workflowVersionId: publishedVersionId, isActive: true, updatedAt } })
        : await transaction.webhookEndpoint.create({ data: { workflowId, workflowVersionId: publishedVersionId, path, secretHash: !githubTrigger && identitySecret ? hashWebhookSecret(identitySecret) : null, encryptedSigningSecret } });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "webhook.created", targetType: "webhook", targetId: saved.id, metadata: { path, secretRequired: Boolean(secretRequired) || Boolean(githubTrigger) || kumaTrigger || telegramTrigger || vercelTrigger || trelloTrigger || sentryTrigger || slackTrigger || gitlabTrigger || jiraTrigger } } });
      return saved;
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ConflictException({ code: "WEBHOOK_PATH_IN_USE", message: "This webhook path is already in use by another workflow." });
      throw error;
    });
    return { id: endpoint.id, path: endpoint.path, secret: vercelTrigger || trelloTrigger || sentryTrigger || slackTrigger || gitlabTrigger || jiraTrigger ? null : secret, workflowVersionId: endpoint.workflowVersionId, createdAt: endpoint.createdAt, updatedAt: endpoint.updatedAt };
  }

  async receiveSlackEvent(raw: Buffer, headers: { signature?: string; timestamp?: string }) {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!verifySlackSignature(raw, headers.signature, headers.timestamp, signingSecret) || !signingSecret || !process.env.SLACK_APP_ID) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Slack signature or app configuration is invalid." });
    const envelope = readSlackEnvelope(raw);
    if (envelope.kind === "challenge") return { challenge: envelope.challenge };
    if (envelope.kind === "ignored" || envelope.appId !== process.env.SLACK_APP_ID) return { acknowledged: true };
    // Scope to active published Slack subscriptions. Each connection is still read
    // through its own Fluxora workspace boundary before any event is accepted.
    let cursor: string | undefined;
    do {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { isActive: true, workflow: { isActive: true, archivedAt: null }, workflowVersion: { graph: { path: ["nodes"], array_contains: [{ type: "trigger.slack.event" }] } } },
        include: { workflow: true, workflowVersion: true }, orderBy: { id: "asc" }, take: 50,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const endpoint of endpoints) {
        if (endpoint.workflow.publishedVersionId !== endpoint.workflowVersionId || !endpoint.secretHash || !endpoint.encryptedSigningSecret) continue;
        const node = parseStoredWorkflowGraph(endpoint.workflowVersion.graph).nodes.find((candidate) => candidate.type === "trigger.slack.event");
        if (!node) continue;
        let connection: Record<string, unknown>;
        try { connection = await this.credentials.readForExecution(String(node.config.credentialId ?? ""), endpoint.workflow.workspaceId, CredentialProvider.SLACK_OAUTH); }
        catch (error) { if (error instanceof NotFoundException) continue; throw error; }
        // No inference from labels, channel names or user-supplied team IDs.
        if (connection.appId !== envelope.appId || connection.teamId !== envelope.teamId) continue;
        const secret = this.vault.decrypt(endpoint.encryptedSigningSecret).secret;
        if (secret !== signingSecret) continue;
        const data = normalizeSlackEvent(envelope, node.config, connection.teamId, signingSecret);
        if (!data) continue;
        try {
          const execution = await this.executions.createSlackScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, payload: data, deliveryKey: envelope.eventId });
          if (execution.status === "QUEUED" && execution.startedAt === null) this.webhookDispatches.start(() => this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true }), () => this.logger.warn(`Slack execution ${execution.id} awaits delivery recovery.`));
        } catch (error) {
          // A concurrent pause/delete affects this subscription, not other owners.
          if (!(error instanceof NotFoundException)) throw error;
        }
      }
      cursor = endpoints.length === 50 ? endpoints.at(-1)!.id : undefined;
    } while (cursor);
    return { acknowledged: true };
  }

  async checkTrelloEndpoint(path: string) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { path }, include: { workflow: true, workflowVersion: true } });
    if (!endpoint || !endpoint.isActive || endpoint.workflow.archivedAt || endpoint.workflow.publishedVersionId !== endpoint.workflowVersionId || !parseStoredWorkflowGraph(endpoint.workflowVersion.graph).nodes.some((node) => node.type === "trigger.trello.board-action")) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
  }

  private async findOwned(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    return workflow;
  }

  async receive(path: string, secret: string | undefined, payload: unknown, idempotencyKey?: string, githubEventHeaders: GitHubEventHeaders = {}, telegramSecret?: string, vercelSignature?: string, trelloSignature?: string, sentrySignature?: string, sentryResource?: string, slackHeaders?: { signature?: string; timestamp?: string }, gitlabHeaders: GitLabHeaders = {}, jiraHeaders: { authorization?: string; deliveryId?: string; deliveryToken?: string } = {}) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { path }, include: { workflow: true, workflowVersion: true } });
    if (!endpoint || !endpoint.isActive || endpoint.workflow.archivedAt) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    const graph = parseStoredWorkflowGraph(endpoint.workflowVersion.graph);
    const githubTrigger = githubWebhookTrigger(graph);
    const kumaTrigger = graph.nodes.find((node) => isUptimeKumaTrigger(node.type));
    const telegramTrigger = graph.nodes.find((node) => node.type === "trigger.telegram.update");
    const vercelTrigger = graph.nodes.find((node) => node.type === "trigger.vercel.deployment");
    const trelloTrigger = graph.nodes.find((node) => node.type === "trigger.trello.board-action");
    const sentryTrigger = graph.nodes.find((node) => node.type === "trigger.sentry.issue-created");
    const slackTrigger = graph.nodes.find((node) => node.type === "trigger.slack.event");
    const gitlabTrigger = graph.nodes.find((node) => node.type.startsWith("trigger.gitlab."));
    const jiraTrigger = graph.nodes.find((node) => node.type === "trigger.jira.issue");
    if (jiraTrigger) {
      const registration = await this.prisma.providerWebhookRegistration.findUnique({ where: { endpointId: endpoint.id } });
      if (!registration || registration.provider !== "JIRA" || registration.state !== "ACTIVE" || registration.workflowVersionId !== endpoint.workflowVersionId || registration.remoteHookId === null || !endpoint.secretHash || !verifyJiraBearer(jiraHeaders.authorization, process.env.JIRA_CLIENT_SECRET, endpoint.id, jiraHeaders.deliveryToken)) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Jira webhook authorization is invalid." });
      if (!endpoint.workflow.isActive || endpoint.workflow.publishedVersionId !== endpoint.workflowVersionId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Activate the current published workflow and update its webhook registration." });
      const [cloudId = "", projectId = "", extra] = registration.repository.split(":");
      if (extra !== undefined || projectId !== jiraTrigger.config.project || registration.event !== jiraTrigger.config.event || registration.credentialId !== jiraTrigger.config.credentialId) throw new ForbiddenException({ code: "JIRA_EVENT_INVALID", message: "Jira webhook registration does not match this workflow." });
      const connection = await this.credentials.readForExecution(registration.credentialId, endpoint.workflow.workspaceId, CredentialProvider.JIRA);
      if (connection.cloudId !== cloudId) throw new ForbiddenException({ code: "JIRA_EVENT_INVALID", message: "Jira webhook connection has changed." });
      if (typeof jiraHeaders.deliveryId !== "string" || !/^[\x21-\x7e]{1,160}$/.test(jiraHeaders.deliveryId)) throw new BadRequestException({ code: "JIRA_EVENT_INVALID", message: "Jira delivery identifier is missing or invalid." });
      const normalized = normalizeJiraIssueEvent(payload, { projectId, event: registration.event as JiraIssueEvent, remoteHookId: Number(registration.remoteHookId), deliveryId: jiraHeaders.deliveryId });
      if (!normalized) return { acknowledged: true };
      if (process.env.JIRA_CLIENT_SECRET && JSON.stringify(normalized).includes(process.env.JIRA_CLIENT_SECRET)) throw new BadRequestException({ code: "JIRA_EVENT_INVALID", message: "Jira event data is invalid." });
      const execution = await this.executions.createJiraScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, registrationId: registration.id, remoteHookId: registration.remoteHookId, payload: normalized, deliveryKey: normalized.deliveryId });
      if (execution.status === "QUEUED" && execution.startedAt === null) this.webhookDispatches.start(() => this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true }), () => this.logger.warn(`Jira execution ${execution.id} awaits delivery recovery.`));
      return { acknowledged: true };
    }
    if (gitlabTrigger) {
      const signingToken = endpoint.encryptedSigningSecret ? this.vault.decrypt(endpoint.encryptedSigningSecret).secret : undefined;
      if (!verifyGitLabSignature(githubEventHeaders.rawBody, gitlabHeaders, signingToken) || typeof signingToken !== "string" || !endpoint.secretHash) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "GitLab signature or timestamp is invalid." });
      if (!endpoint.workflow.isActive || endpoint.workflow.publishedVersionId !== endpoint.workflowVersionId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Activate the current published workflow and update its webhook registration." });
      const normalized = normalizeGitLabEvent(githubEventHeaders.rawBody!, gitlabHeaders, gitlabTrigger.type, gitlabTrigger.config);
      if (!normalized) return { acknowledged: true };
      if (JSON.stringify(normalized).includes(signingToken)) throw new BadRequestException({ code: "GITLAB_EVENT_INVALID", message: "GitLab event data is invalid." });
      const execution = await this.executions.createLegacyWebhookExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, encryptedSigningSecret: endpoint.encryptedSigningSecret, payload: normalized, idempotencyKey: `webhook:${endpoint.id}:gitlab:${gitlabHeaders.id}` });
      if (execution.status === "QUEUED" && execution.startedAt === null) this.webhookDispatches.start(() => this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true }), () => this.logger.warn(`GitLab execution ${execution.id} awaits delivery recovery.`));
      return { acknowledged: true };
    }
    if (slackTrigger) {
      const signingSecret = endpoint.encryptedSigningSecret ? this.vault.decrypt(endpoint.encryptedSigningSecret).secret : undefined;
      if (!verifySlackSignature(githubEventHeaders.rawBody, slackHeaders?.signature, slackHeaders?.timestamp, signingSecret) || typeof signingSecret !== "string" || !endpoint.secretHash) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Slack signature or request timestamp is invalid." });
      if (endpoint.workflow.publishedVersionId !== endpoint.workflowVersionId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Republish and update the webhook registration." });
      const envelope = readSlackEnvelope(githubEventHeaders.rawBody!);
      // Slack verifies the URL before activation; only signed challenges bypass the active-run check.
      if (envelope.kind === "challenge") return { challenge: envelope.challenge };
      if (!endpoint.workflow.isActive || envelope.kind === "ignored") return { acknowledged: true };
      const credential = await this.credentials.readForExecution(String(slackTrigger.config.credentialId ?? ""), endpoint.workflow.workspaceId, CredentialProvider.SLACK_OAUTH);
      const data = normalizeSlackEvent(envelope, slackTrigger.config, credential.teamId, signingSecret);
      if (!data) return { acknowledged: true };
      const execution = await this.executions.createSlackScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, payload: data, deliveryKey: envelope.eventId });
      // Acknowledgement follows the database commit, not provider work or a stalled Redis connection.
      // Shutdown drains this service's dispatches; the delivery recovery service handles lost jobs.
      if (execution.status === "QUEUED" && execution.startedAt === null) this.webhookDispatches.start(() => this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true }), () => this.logger.warn(`Slack execution ${execution.id} awaits delivery recovery.`));
      return { acknowledged: true };
    }
    if (sentryTrigger) {
      const signingSecret = endpoint.encryptedSigningSecret ? this.vault.decrypt(endpoint.encryptedSigningSecret).secret : undefined;
      if (!verifySentryIntegrationSignature(githubEventHeaders.rawBody, sentrySignature, signingSecret) || !endpoint.secretHash) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
      if (!endpoint.workflow.isActive) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      const event = normalizeSentryIssueCreated(githubEventHeaders.rawBody!, sentryResource, readSentryIssueCreatedFilter(sentryTrigger.config), typeof signingSecret === "string" ? signingSecret : undefined);
      if (event.kind === "ignored") return { acknowledged: true };
      const execution = await this.executions.createSentryScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, payload: event.payload, deliveryKey: event.deliveryKey });
      if (execution.status === "QUEUED" && execution.startedAt === null) await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true });
      return { executionId: execution.id };
    }
    if (trelloTrigger) {
      const signing = endpoint.encryptedSigningSecret ? this.vault.decrypt(endpoint.encryptedSigningSecret) : undefined;
      if (!verifyTrelloSignature(githubEventHeaders.rawBody, trelloSignature, signing?.secret, signing?.callbackUrl) || !endpoint.secretHash) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
      if (!endpoint.workflow.isActive) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      const event = normalizeTrelloAction(githubEventHeaders.rawBody!, readTrelloTriggerFilter(trelloTrigger.config), typeof signing?.secret === "string" ? signing.secret : undefined);
      if (event.kind === "ignored") return { acknowledged: true };
      const execution = await this.executions.createTrelloScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, payload: event.payload, deliveryKey: event.actionId });
      if (execution.status === "QUEUED" && execution.startedAt === null) await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true });
      return { executionId: execution.id };
    }
    if (vercelTrigger) {
      const signingSecret = endpoint.encryptedSigningSecret ? this.vault.decrypt(endpoint.encryptedSigningSecret).secret : undefined;
      if (!verifyVercelSignature(githubEventHeaders.rawBody, vercelSignature, signingSecret) || !endpoint.secretHash) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
      if (!endpoint.workflow.isActive) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      const event = normalizeVercelDeployment(githubEventHeaders.rawBody!, vercelTriggerFilterFromConfig(vercelTrigger.config), typeof signingSecret === "string" ? signingSecret : undefined);
      if (event.kind === "ignored") return { acknowledged: true };
      const execution = await this.executions.createVercelScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash, payload: event.payload, deliveryKey: event.eventId });
      if (execution.status === "QUEUED" && execution.startedAt === null) await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true });
      return { executionId: execution.id };
    }
    if (telegramTrigger && (githubTrigger || kumaTrigger || !telegramWebhookSecretMatches(telegramSecret, endpoint.secretHash))) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
    if (kumaTrigger && (githubTrigger || !endpoint.secretHash)) throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
    let credentialSnapshot: { id: string; encryptedData: string } | undefined;
    if (githubTrigger) {
      credentialSnapshot = await this.verifyGitHubWebhook(endpoint.workflow.workspaceId, githubTrigger.config, payload, githubEventHeaders, endpoint.encryptedSigningSecret);
      if (githubEventHeaders.githubEvent === "ping") return { acknowledged: true };
    } else if (!telegramTrigger && endpoint.secretHash && (!secret || !matchesWebhookSecret(secret, endpoint.secretHash))) {
      throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
    }
    const normalized = kumaTrigger ? normalizeUptimeKumaAlert(payload) : null;
    if (normalized?.test) return { acknowledged: true };
    if (!endpoint.workflow.isActive) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    if (telegramTrigger) {
      const update = normalizeTelegramUpdate(payload, telegramTriggerFilterFromConfig(telegramTrigger.config));
      if (update.kind === "ignored") return { acknowledged: true };
      const execution = await this.executions.createTelegramScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash!, payload: update.payload, deliveryKey: String(update.updateId) });
      if (execution.status === "QUEUED" && execution.startedAt === null) await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true });
      return { executionId: execution.id };
    }
    if (normalized && !normalized.test && kumaTrigger) {
      const monitor = normalized.payload.monitor as { id: string };
      const heartbeat = normalized.payload.heartbeat as { status: number };
      if (!matchesUptimeKumaFilter(kumaTrigger.config, monitor.id, heartbeat.status)) return { acknowledged: true };
      const execution = await this.executions.createKumaScheduledExecution({ workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path, secretHash: endpoint.secretHash!, payload: normalized.payload, deliveryKey: idempotencyKey });
      // A persisted delivery is recovered after a queue outage. This job is
      // explicitly initial-only, so a duplicate cannot resume an approval.
      if (execution.status === "QUEUED" && execution.startedAt === null) await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true });
      return { executionId: execution.id };
    }
    const deliveryKey = githubTrigger && githubEventHeaders.githubDelivery ? `github:${githubEventHeaders.githubDelivery}` : idempotencyKey;
    const execution = await this.executions.createLegacyWebhookExecution({
      workflowId: endpoint.workflowId, workflowVersionId: endpoint.workflowVersionId, endpointId: endpoint.id, path: endpoint.path,
      secretHash: endpoint.secretHash, encryptedSigningSecret: endpoint.encryptedSigningSecret, credentialSnapshot,
      payload: normalized ? normalized.payload : payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { payload },
      // Even without a caller delivery ID, persist a unique local identity so
      // an accepted, never-started execution can be recovered after an outage.
      // Distinct requests without a caller ID cannot be deduplicated.
      idempotencyKey: `webhook:${endpoint.id}:${deliveryKey ?? `generated:${randomBytes(24).toString("hex")}`}`,
    });
    // A redelivery can refer to a run already waiting for an approval or to a
    // queued continuation. Never let a delivery job claim that later phase.
    if (execution.status === "QUEUED" && execution.startedAt === null) await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true });
    return { executionId: execution.id };
  }

  private async verifyGitHubWebhook(workspaceId: string, config: Record<string, unknown>, payload: unknown, headers: GitHubEventHeaders, encryptedSigningSecret: string | null) {
    const credentialId = readCredentialId(config);
    if (!headers.rawBody || !headers.githubSignature) {
      throw new ForbiddenException({ code: "GITHUB_WEBHOOK_SIGNATURE_INVALID", message: "The GitHub webhook signature is invalid." });
    }
    const credential = !encryptedSigningSecret && credentialId ? await this.credentials.readForExecutionSnapshot(credentialId, workspaceId, CredentialProvider.GITHUB) : null;
    const webhookSecret = encryptedSigningSecret ? readSecret(this.vault.decrypt(encryptedSigningSecret).secret) : readSecret(credential?.data.webhookSecret);
    if (!webhookSecret || !verifyGitHubWebhookSignature(headers.rawBody, headers.githubSignature, webhookSecret)) {
      throw new ForbiddenException({ code: "GITHUB_WEBHOOK_SIGNATURE_INVALID", message: "The GitHub webhook signature is invalid." });
    }
    const eventName = readString(config.event) ?? "issues";
    const action = readString(config.action) ?? (eventName === "issues" || eventName === "pull_request" ? "opened" : null);
    if (!isRecord(payload) || (headers.githubEvent !== "ping" && (headers.githubEvent !== eventName || (action && payload.action !== action)))) {
      throw new ForbiddenException({ code: "GITHUB_EVENT_NOT_MATCHED", message: "The GitHub webhook event does not match this trigger." });
    }
    const repositoryFilter = readString(config.repository);
    const repositoryName = isRecord(payload.repository) ? readString(payload.repository.full_name) : null;
    if (repositoryFilter && repositoryName !== repositoryFilter) {
      throw new ForbiddenException({ code: "GITHUB_REPOSITORY_NOT_MATCHED", message: "The GitHub webhook repository does not match this trigger." });
    }
    return credential && credentialId ? { id: credentialId, encryptedData: credential.encryptedData } : undefined;
  }
}

export type GitHubEventHeaders = { githubEvent?: string; githubSignature?: string; githubDelivery?: string; rawBody?: Buffer };

function isUptimeKumaTrigger(type: string) {
  return type === "trigger.uptime-kuma.alert";
}

function githubWebhookTrigger(graph: ReturnType<typeof parseStoredWorkflowGraph>) {
  return graph.nodes.find((node) => node.type === "trigger.github.issue-opened" || node.type === "trigger.github.pull-request-opened" || node.type === "trigger.github.push" || node.type === "trigger.github.workflow-run-completed");
}

function readCredentialId(config: Record<string, unknown>) {
  return typeof config.credentialId === "string" && config.credentialId.trim() ? config.credentialId.trim() : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSecret(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeUptimeKumaAlert(payload: unknown): { test: true } | { test: false; payload: Record<string, unknown> } {
  if (!isRecord(payload) || typeof payload.msg !== "string" || payload.msg.length > 4096) throw new BadRequestException({ code: "UPTIME_KUMA_PAYLOAD_INVALID", message: "Expected an Uptime Kuma JSON notification." });
  if (payload.monitor == null && payload.heartbeat == null) return { test: true };
  const monitor = payload.monitor;
  const heartbeat = payload.heartbeat;
  if (!isRecord(monitor) || !isRecord(heartbeat) || (typeof monitor.id !== "number" && typeof monitor.id !== "string") || typeof monitor.name !== "string" || monitor.name.length > 300 || !Number.isInteger(heartbeat.status) || (heartbeat.status as number) < 0 || (heartbeat.status as number) > 3) throw new BadRequestException({ code: "UPTIME_KUMA_PAYLOAD_INVALID", message: "Expected a monitor and heartbeat in the Uptime Kuma notification." });
  const monitorId = String(monitor.id);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(monitorId)) throw new BadRequestException({ code: "UPTIME_KUMA_PAYLOAD_INVALID", message: "Monitor ID is invalid." });
  return { test: false, payload: { source: "uptime-kuma", monitor: { id: monitorId, name: monitor.name }, heartbeat: { status: heartbeat.status, time: typeof heartbeat.time === "string" ? heartbeat.time.slice(0, 100) : null, ping: typeof heartbeat.ping === "number" && Number.isFinite(heartbeat.ping) ? heartbeat.ping : null }, message: payload.msg } };
}

export function hashWebhookSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesWebhookSecret(value: string, expected: string) {
  const actual = Buffer.from(hashWebhookSecret(value), "hex");
  const known = Buffer.from(expected, "hex");
  return actual.length === known.length && timingSafeEqual(actual, known);
}

export function verifyGitHubWebhookSignature(rawBody: Buffer, signature: string, secret: string) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const actual = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = signature.slice("sha256=".length);
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
