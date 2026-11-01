import { CredentialProvider, ExecutionStatus } from "@prisma/client";
import { validatePostgresCredential } from "../execution/postgres-read";
import { validateMongoCredential } from "../execution/mongodb-find";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { CredentialVaultService } from "./credential-vault.service";
import { validateSmtpCredentialData } from "../execution/smtp-email";

const providers = new Set(Object.values(CredentialProvider));
const googleRefreshSkewMs = 60_000;
const canonicalGoogleOAuthLabel = "Google OAuth";

function isCanonicalGoogleOAuth(credential: { provider: CredentialProvider; label: string }): boolean {
  return (credential.provider === CredentialProvider.GOOGLE && credential.label === canonicalGoogleOAuthLabel)
    || (credential.provider === CredentialProvider.GOOGLE_CHAT_OAUTH && credential.label === "Google Chat OAuth")
    || (credential.provider === CredentialProvider.GMAIL && credential.label === "Gmail OAuth")
    || (credential.provider === CredentialProvider.GOOGLE_CALENDAR && credential.label === "Google Calendar OAuth");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === code;
}

@Injectable()
export class CredentialService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
    @Inject(CredentialVaultService) private readonly vault: CredentialVaultService,
  ) {}

  async list(workspaceId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const credentials = await this.prisma.credential.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } });
    return credentials.map((credential) => this.summary(credential));
  }

  async requireOwner(workspaceId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
  }

  async references(workspaceId: string, credentialId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    return this.findReferences(workspaceId, credentialId);
  }

  async create(workspaceId: string, userId: string, input: { provider: string; label: string; data: unknown }) {
    await this.workspaces.requireOwner(workspaceId, userId);
    if (!providers.has(input.provider as CredentialProvider)) throw new BadRequestException({ code: "CREDENTIAL_PROVIDER_NOT_FOUND", message: "Credential provider is not supported." });
    if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Credential data must be a JSON object." });
    validateCredentialPayload(input.provider as CredentialProvider, input.data as Record<string, unknown>);

    const trimmedLabel = input.label.trim();
    if (isCanonicalGoogleOAuth({ provider: input.provider as CredentialProvider, label: trimmedLabel })) {
      throw new BadRequestException({
        code: "CREDENTIAL_MANAGED_BY_OAUTH",
        message: "Google OAuth credentials are managed through Google sign-in and cannot be manually created.",
      });
    }

    const existing = await this.prisma.credential.findUnique({
      where: { workspaceId_provider_label: { workspaceId, provider: input.provider as CredentialProvider, label: trimmedLabel } },
    });
    if (existing) {
      throw new ConflictException({
        code: "CREDENTIAL_LABEL_CONFLICT",
        message: `A ${input.provider} credential named "${trimmedLabel}" already exists in this workspace.`,
      });
    }

    try {
      const credential = await this.prisma.credential.create({
        data: { workspaceId, provider: input.provider as CredentialProvider, label: trimmedLabel, encryptedData: this.vault.encrypt(input.data as Record<string, unknown>) },
      });
      await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.created", targetType: "credential", targetId: credential.id, metadata: { provider: credential.provider, label: credential.label } } });
      return this.summary(credential);
    } catch (error: unknown) {
      if (hasErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "CREDENTIAL_LABEL_CONFLICT",
          message: `A ${input.provider} credential named "${trimmedLabel}" already exists in this workspace.`,
        });
      }
      throw error;
    }
  }

  async update(workspaceId: string, credentialId: string, userId: string, input: { label?: string; data?: unknown }) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });

    if (isCanonicalGoogleOAuth(credential)) {
      throw new BadRequestException({
        code: "CREDENTIAL_MANAGED_BY_OAUTH",
        message: "Google OAuth credentials are managed through Google sign-in and cannot be manually edited.",
      });
    }

    if (input.label === undefined && input.data === undefined) {
      throw new BadRequestException({ code: "INVALID_INPUT", message: "Provide a label or secret data to update." });
    }

    let nextLabel: string | undefined;
    if (input.label !== undefined) {
      nextLabel = input.label.trim();
      if (nextLabel.length === 0 || nextLabel.length > 80) {
        throw new BadRequestException({ code: "INVALID_INPUT", message: "Credential label must be between 1 and 80 characters." });
      }
      if (nextLabel !== credential.label) {
        if (isCanonicalGoogleOAuth({ provider: credential.provider, label: nextLabel })) {
          throw new BadRequestException({
            code: "CREDENTIAL_MANAGED_BY_OAUTH",
            message: "Google OAuth credentials are managed through Google sign-in and cannot be manually edited.",
          });
        }
        const conflicting = await this.prisma.credential.findUnique({
          where: { workspaceId_provider_label: { workspaceId, provider: credential.provider, label: nextLabel } },
        });
        if (conflicting && conflicting.id !== credential.id) {
          throw new ConflictException({
            code: "CREDENTIAL_LABEL_CONFLICT",
            message: `A ${credential.provider} credential named "${nextLabel}" already exists in this workspace.`,
          });
        }
      }
    }

    let nextEncryptedData: string | undefined;
    if (input.data !== undefined) {
      if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
        throw new BadRequestException({ code: "INVALID_INPUT", message: "Credential data must be a JSON object." });
      }
      let replacementData = input.data as Record<string, unknown>;
      validateCredentialPayload(credential.provider, replacementData);
      if (credential.provider === CredentialProvider.GITHUB && replacementData.webhookSecret === undefined) {
        const existingData = this.vault.decrypt(credential.encryptedData);
        if (typeof existingData.webhookSecret === "string") replacementData = { ...replacementData, webhookSecret: existingData.webhookSecret };
      }
      if (credential.provider === CredentialProvider.TELEGRAM_BOT && replacementData.chatId === undefined) {
        try {
          const existingData = this.vault.decrypt(credential.encryptedData);
          if (existingData && typeof existingData === "object" && "chatId" in existingData && existingData.chatId !== undefined) {
            replacementData = {
              ...replacementData,
              chatId: existingData.chatId,
            };
          }
        } catch {
          // If existing credential cannot be decrypted, proceed with replacementData
        }
      }
      nextEncryptedData = this.vault.encrypt(replacementData);
    }

    try {
      const updated = await this.prisma.credential.update({
        where: { id: credential.id },
        data: {
          ...(nextLabel !== undefined ? { label: nextLabel } : {}),
          ...(nextEncryptedData !== undefined ? { encryptedData: nextEncryptedData } : {}),
        },
      });

      const isRenamed = nextLabel !== undefined && nextLabel !== credential.label;
      const isRotated = nextEncryptedData !== undefined;
      const action = isRotated && isRenamed ? "credential.updated" : isRotated ? "credential.rotated" : "credential.renamed";

      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action,
          targetType: "credential",
          targetId: credential.id,
          metadata: {
            provider: credential.provider,
            label: updated.label,
            ...(isRotated && isRenamed ? { rotated: true, renamed: true } : {}),
          },
        },
      });

      return this.summary(updated);
    } catch (error: unknown) {
      if (hasErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "CREDENTIAL_LABEL_CONFLICT",
          message: `A ${credential.provider} credential named "${nextLabel}" already exists in this workspace.`,
        });
      }
      throw error;
    }
  }

  async delete(workspaceId: string, credentialId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });

    if (isCanonicalGoogleOAuth(credential)) {
      throw new BadRequestException({
        code: "CREDENTIAL_MANAGED_BY_OAUTH",
        message: "Google OAuth credentials are managed through Google sign-in and cannot be deleted directly.",
      });
    }

    const references = await this.findReferences(workspaceId, credentialId);
    const blockingWorkflows = references.workflows.map(({ id, name }) => ({ id, name }));
    const blockingExecutions = references.executions.map(({ id }) => ({ id }));

    if (blockingWorkflows.length > 0 || blockingExecutions.length > 0) {
      throw new ConflictException({
        code: "CREDENTIAL_IN_USE",
        message: "Credential is in use and cannot be deleted.",
        details: {
          workflows: blockingWorkflows,
          executions: blockingExecutions,
        },
      });
    }

    await this.prisma.credential.delete({ where: { id: credential.id } });
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: "credential.deleted",
        targetType: "credential",
        targetId: credential.id,
        metadata: { provider: credential.provider, label: credential.label },
      },
    });

    return { success: true, id: credential.id };
  }

  private async findReferences(workspaceId: string, credentialId: string) {
    const workflows = await this.prisma.workflow.findMany({
      where: { workspaceId },
      include: {
        draftVersion: { select: { graph: true } },
        publishedVersion: { select: { graph: true } },
      },
    });

    const workflowReferences = workflows.flatMap((workflow) => {
      const locations: Array<"draft" | "published"> = [];
      if (workflow.draftVersion && graphUsesCredential(workflow.draftVersion.graph, credentialId)) locations.push("draft");
      if (workflow.publishedVersion && graphUsesCredential(workflow.publishedVersion.graph, credentialId)) locations.push("published");
      return locations.length > 0 ? [{ id: workflow.id, name: workflow.name, locations }] : [];
    });

    const activeExecutions = await this.prisma.execution.findMany({
      where: {
        status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING, ExecutionStatus.WAITING_APPROVAL] },
        workflowVersion: { workflow: { workspaceId } },
      },
      select: {
        id: true,
        status: true,
        mode: true,
        createdAt: true,
        workflowVersion: { select: { graph: true } },
      },
    });

    const executionReferences = activeExecutions.flatMap((execution) =>
      graphUsesCredential(execution.workflowVersion.graph, credentialId)
        ? [{ id: execution.id, status: execution.status, mode: execution.mode, createdAt: execution.createdAt }]
        : [],
    );

    return { workflows: workflowReferences, executions: executionReferences };
  }

  async readForExecution(credentialId: string, workspaceId: string, provider: CredentialProvider) {
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    return this.vault.decrypt(credential.encryptedData);
  }

  async readGoogleForExecution(credentialId: string, workspaceId: string, provider: typeof CredentialProvider.GOOGLE | typeof CredentialProvider.GOOGLE_CHAT_OAUTH | typeof CredentialProvider.GMAIL | typeof CredentialProvider.GOOGLE_CALENDAR = CredentialProvider.GOOGLE) {
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    const data = this.vault.decrypt(credential.encryptedData);
    if (!requiresGoogleRefresh(data)) return data;
    const refreshToken = readString(data.refreshToken);
    if (!refreshToken) throw new BadRequestException({ code: "GOOGLE_TOKEN_EXPIRED", message: "Google access token has expired. Connect Google again." });
    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_FAILED", message: "Google access token could not be refreshed. Connect Google again." });
    const refreshed = await response.json() as Record<string, unknown>;
    const accessToken = readString(refreshed.access_token);
    if (!accessToken) throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_FAILED", message: "Google did not return a refreshed access token." });
    const updated = {
      ...data,
      accessToken,
      refreshToken: readString(refreshed.refresh_token) ?? refreshToken,
      expiresAt: typeof refreshed.expires_in === "number" ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : undefined,
    };
    await this.prisma.credential.update({ where: { id: credential.id }, data: { encryptedData: this.vault.encrypt(updated) } });
    return updated;
  }

  async upsertGoogleOAuth(workspaceId: string, userId: string, data: Record<string, unknown>) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const encryptedData = this.vault.encrypt(data);
    const credential = await this.prisma.credential.upsert({
      where: { workspaceId_provider_label: { workspaceId, provider: CredentialProvider.GOOGLE, label: "Google OAuth" } },
      create: { workspaceId, provider: CredentialProvider.GOOGLE, label: "Google OAuth", encryptedData },
      update: { encryptedData },
    });
    await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.google_oauth_connected", targetType: "credential", targetId: credential.id } });
    return this.summary(credential);
  }

  async upsertGoogleChatOAuth(workspaceId: string, userId: string, data: Record<string, unknown>) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const encryptedData = this.vault.encrypt(data);
    const provider = CredentialProvider.GOOGLE_CHAT_OAUTH;
    const label = "Google Chat OAuth";
    const credential = await this.prisma.credential.upsert({
      where: { workspaceId_provider_label: { workspaceId, provider, label } },
      create: { workspaceId, provider, label, encryptedData },
      update: { encryptedData },
    });
    await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.google_chat_oauth_connected", targetType: "credential", targetId: credential.id } });
    return this.summary(credential);
  }

  async upsertGmailOAuth(workspaceId: string, userId: string, data: Record<string, unknown>) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const encryptedData = this.vault.encrypt(data);
    const provider = CredentialProvider.GMAIL;
    const label = "Gmail OAuth";
    const credential = await this.prisma.credential.upsert({
      where: { workspaceId_provider_label: { workspaceId, provider, label } },
      create: { workspaceId, provider, label, encryptedData },
      update: { encryptedData },
    });
    await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.gmail_oauth_connected", targetType: "credential", targetId: credential.id } });
    return this.summary(credential);
  }

  async upsertGoogleCalendarOAuth(workspaceId: string, userId: string, data: Record<string, unknown>) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const encryptedData = this.vault.encrypt(data);
    const provider = CredentialProvider.GOOGLE_CALENDAR;
    const label = "Google Calendar OAuth";
    const credential = await this.prisma.credential.upsert({ where: { workspaceId_provider_label: { workspaceId, provider, label } }, create: { workspaceId, provider, label, encryptedData }, update: { encryptedData } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.google_calendar_oauth_connected", targetType: "credential", targetId: credential.id } });
    return this.summary(credential);
  }

  private summary(credential: { id: string; provider: CredentialProvider; label: string; createdAt: Date; updatedAt: Date }) {
    return {
      id: credential.id,
      provider: credential.provider,
      label: credential.label,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      isManaged: isCanonicalGoogleOAuth(credential),
    };
  }
}

function requiresGoogleRefresh(data: Record<string, unknown>) {
  const expiresAt = readString(data.expiresAt);
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry <= Date.now() + googleRefreshSkewMs;
}

function readString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function requiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) throw new BadRequestException({ code: "GOOGLE_OAUTH_NOT_CONFIGURED", message: `${name} is not configured.` });
  return value;
}

function validateCredentialPayload(provider: CredentialProvider, data: Record<string, unknown>) {
  if (provider === CredentialProvider.REDDIT) {
    if (typeof data.clientId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(data.clientId) || typeof data.clientSecret !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(data.clientSecret) || typeof data.username !== "string" || !/^[A-Za-z0-9_-]{3,20}$/.test(data.username)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Reddit client ID, client secret and Reddit username." });
    return;
  }
  if (provider === CredentialProvider.SUPABASE) {
    if (typeof data.projectRef !== "string" || !/^[a-z0-9]{10,40}$/.test(data.projectRef) || typeof data.apiKey !== "string" || !/^[A-Za-z0-9._-]{1,4096}$/.test(data.apiKey)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Supabase project reference and API key." });
    return;
  }
  if (provider === CredentialProvider.VERCEL) {
    if (typeof data.token !== "string" || !/^[A-Za-z0-9._-]{1,512}$/.test(data.token)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Vercel access token." });
    return;
  }
  if (provider === CredentialProvider.SENTRY) {
    if (typeof data.token !== "string" || !/^[A-Za-z0-9._-]{1,512}$/.test(data.token) || !["global", "us", "de"].includes(typeof data.region === "string" ? data.region : "global")) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Sentry token and region." });
    return;
  }
  if (provider === CredentialProvider.TRELLO) {
    if (typeof data.apiKey !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(data.apiKey) || typeof data.token !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(data.token)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Trello API key and token." });
    return;
  }
  if (provider === CredentialProvider.POSTGRES) {
    try { validatePostgresCredential(data); } catch { throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid PostgreSQL connection." }); }
    return;
  }
  if (provider === CredentialProvider.NOTION) {
    if (typeof data.token !== "string" || !data.token || data.token.length > 4096 || /\s/.test(data.token)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Notion integration token." });
    return;
  }
  if (provider === CredentialProvider.MONGODB) {
    try { validateMongoCredential(data); } catch { throw new BadRequestException({ code: "INVALID_INPUT", message: data.configurationType === "connectionString" ? "Enter a supported MongoDB connection string with one public host, credentials and TLS. Check its options." : "Enter a public MongoDB host, port, username, password and authentication database." }); }
    return;
  }
  if (provider === CredentialProvider.GOOGLE_CHAT_OAUTH || provider === CredentialProvider.GMAIL || provider === CredentialProvider.GOOGLE_CALENDAR) {
    if (typeof data.accessToken !== "string" || !data.accessToken || data.accessToken.length > 4096 || /\s/.test(data.accessToken)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Google access token for this connection." });
    return;
  }
  if (provider === CredentialProvider.GEMINI || provider === CredentialProvider.OPENAI) {
    if (typeof data.apiKey !== "string" || !data.apiKey.trim() || data.apiKey.length > 512 || /[\r\n]/.test(data.apiKey)) {
      throw new BadRequestException({ code: "INVALID_INPUT", message: "API key must be a non-empty string of at most 512 characters." });
    }
    return;
  }
  if (provider !== CredentialProvider.SMTP) return;
  try {
    validateSmtpCredentialData(data);
  } catch (reason) {
    throw new BadRequestException({
      code: "INVALID_INPUT",
      message: reason instanceof Error ? reason.message : "SMTP credential is invalid.",
    });
  }
}

function graphUsesCredential(graphValue: unknown, credentialId: string): boolean {
  if (!graphValue || typeof graphValue !== "object") return false;
  const nodes = (graphValue as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const config = (node as Record<string, unknown>).config ?? ((node as Record<string, unknown>).data as Record<string, unknown> | undefined)?.config;
    if (config && typeof config === "object") {
      const configRecord = config as Record<string, unknown>;
      if (configRecord.credentialId === credentialId) return true;
      if (configRecord.notificationCredentialId === credentialId) return true;
    }
  }
  return false;
}
