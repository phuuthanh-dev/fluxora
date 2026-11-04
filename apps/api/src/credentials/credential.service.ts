import { CredentialProvider, ExecutionStatus, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { chatManageProof, chatManageScope, chatManageValid, googleChatScopesGranted, googleSubject, googleConnectionPolicy, googleScopesGranted, googleScopeTokenHash, googleScopeProof, googleScopeProofValid, googleRefreshGrantProof, googleRefreshGrantValid, gmailCapabilityProof, gmailCapabilitiesValid, gmailCapabilitiesGranted, projectGmailScopes, validGmailCapabilities, sameGoogleScopes, type GmailCapability, type GoogleConnectionKind } from "./google-oauth-policy";
import { validatePostgresCredential } from "../execution/postgres-read";
import { NodeFailure } from "../execution/node-failure";
import { validateMongoCredential } from "../execution/mongodb-find";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { CredentialVaultService } from "./credential-vault.service";
import { credentialHints } from "./credential-hints";
import { graphCredentialIds } from "./credential-references";
import { validateSmtpCredentialData } from "../execution/smtp-email";

const providers = new Set(Object.values(CredentialProvider));
const googleRefreshSkewMs = 60_000;
function isCanonicalGoogleOAuth(credential: { provider: CredentialProvider; label: string }): boolean {
  return Object.values(googleConnectionPolicy).some(({ provider, label }) => credential.provider === provider && (credential.label === label || (credential.label.startsWith(`${label} · `) && / · [a-f0-9]{16}$/.test(credential.label))));
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
    return this.prisma.$transaction(async (tx) => {
      // Graph saves and live executions hold a shared lock on the same row.
      await tx.$queryRaw`SELECT id FROM "Credential" WHERE id = ${credentialId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
      const credential = await tx.credential.findFirst({ where: { id: credentialId, workspaceId } });
      if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
      const references = await this.findReferences(workspaceId, credentialId, tx);
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

      await tx.credential.delete({ where: { id: credential.id } });
      await tx.auditLog.create({
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
    });
  }

  private async findReferences(workspaceId: string, credentialId: string, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const workflows = await db.workflow.findMany({
      where: { workspaceId },
      include: {
        draftVersion: { select: { graph: true } },
        publishedVersion: { select: { graph: true } },
      },
    });

    const workflowReferences = workflows.flatMap((workflow) => {
      const locations: Array<"draft" | "published"> = [];
      if (workflow.draftVersion && graphCredentialIds(workflow.draftVersion.graph).includes(credentialId)) locations.push("draft");
      if (workflow.publishedVersion && graphCredentialIds(workflow.publishedVersion.graph).includes(credentialId)) locations.push("published");
      return locations.length > 0 ? [{ id: workflow.id, name: workflow.name, locations }] : [];
    });

    const activeExecutions = await db.execution.findMany({
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
      graphCredentialIds(execution.workflowVersion.graph).includes(credentialId)
        ? [{ id: execution.id, status: execution.status, mode: execution.mode, createdAt: execution.createdAt }]
        : [],
    );

    return { workflows: workflowReferences, executions: executionReferences };
  }

  async readForExecution(credentialId: string, workspaceId: string, provider: CredentialProvider) {
    return (await this.readForExecutionSnapshot(credentialId, workspaceId, provider)).data;
  }

  /** Internal snapshot for operations that must fence concurrent secret rotation. */
  async readForExecutionSnapshot(credentialId: string, workspaceId: string, provider: CredentialProvider) {
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    return { data: this.vault.decrypt(credential.encryptedData), encryptedData: credential.encryptedData };
  }

  async readGoogleForExecution(credentialId: string, workspaceId: string, provider: typeof CredentialProvider.GOOGLE | typeof CredentialProvider.GOOGLE_CHAT_OAUTH | typeof CredentialProvider.GMAIL | typeof CredentialProvider.GOOGLE_CALENDAR = CredentialProvider.GOOGLE) {
    const initial = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
    if (!initial) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    const initialData = sanitizeGoogleScopeEvidence(this.vault.decrypt(initial.encryptedData), initial);
    if (initialData.grantedScopes !== undefined && !requiredGoogleScopes(provider, initialData.grantedScopes)) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Google permissions are incomplete. Reconnect this account." });
    if (!requiresGoogleRefresh(initialData)) return withoutGoogleScopeProof(initialData, provider);

    const deadline = Date.now() + 25_000;
    let delayMs = 100;
    // Checkout errors are retryable only before the transaction callback starts;
    // an identical Prisma code during the transaction may mean a real failure.
    const checkoutTimedOut = (error: unknown, entered: boolean) => !entered && (
      hasErrorCode(error, "P2024") || (hasErrorCode(error, "P2028") && error instanceof Error && /unable to start a transaction in the given time/i.test(error.message))
    );
    const reread = async () => {
      const remaining = deadline - Date.now();
      if (remaining <= 1) return undefined;
      const maxWait = Math.min(1000, Math.max(1, Math.floor(remaining / 4)));
      let entered = false;
      try {
        return await this.prisma.$transaction(async (tx) => {
          entered = true;
          const current = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
          return current ? this.usableGoogleCredential(current, provider) : undefined;
        }, { maxWait, timeout: Math.max(1, remaining - maxWait) });
      } catch (error) {
        if (checkoutTimedOut(error, entered)) return undefined;
        throw error;
      }
    };
    try {
      while (Date.now() < deadline) {
        const remainingBudget = deadline - Date.now();
        const maxWait = Math.min(1000, Math.max(1, Math.floor(remainingBudget / 4)));
        const transactionTimeout = Math.max(1, remainingBudget - maxWait);
        let entered = false;
        let outcome: { busy: true } | { busy: false; credential: Record<string, unknown> };
        try {
          outcome = await this.prisma.$transaction(async (tx) => {
          entered = true;
          const transactionStartedAt = Date.now();
          // Contenders release their DB connection immediately when the lock is
          // held. Only the owner keeps a transaction open during the provider call.
          const lockKey = `google-oauth-refresh:${workspaceId}:${credentialId}`;
          const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked`;
          if (!lock[0]?.locked) return { busy: true as const };
          const credential = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
          if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
          const data = sanitizeGoogleScopeEvidence(this.vault.decrypt(credential.encryptedData), credential);
          if (data.grantedScopes !== undefined && !requiredGoogleScopes(provider, data.grantedScopes)) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Google permissions are incomplete. Reconnect this account." });
          if (!requiresGoogleRefresh(data)) return { busy: false as const, credential: withoutGoogleScopeProof(data, provider) };
          if (data.refreshGrantAmbiguous === true) throw new BadRequestException({ code: "GOOGLE_OAUTH_REFRESH_SCOPE_UNVERIFIED", message: "Google changed the granted permissions. Reconnect this account to verify permissions before refreshing." });
          const refreshToken = readString(data.refreshToken);
          if (!refreshToken) throw new BadRequestException({ code: "GOOGLE_TOKEN_EXPIRED", message: "Google access token has expired. Connect Google again." });
          const clientId = requiredEnv("GOOGLE_CLIENT_ID");
          const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
          const providerBudget = Math.min(20_000, deadline - Date.now() - 500, transactionTimeout - (Date.now() - transactionStartedAt) - 500);
          if (providerBudget <= 0) throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_BUSY", message: "Google connection is being refreshed. Try again." });
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
            signal: AbortSignal.timeout(providerBudget),
          });
          if (!response.ok) throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_FAILED", message: "Google access token could not be refreshed. Connect Google again." });
          const refreshed = await response.json() as Record<string, unknown>;
          const accessToken = readString(refreshed.access_token);
          if (!accessToken || /\s/.test(accessToken) || typeof refreshed.expires_in !== "number" || !Number.isFinite(refreshed.expires_in) || refreshed.expires_in <= 0 || !Number.isFinite(new Date(Date.now() + refreshed.expires_in * 1000).getTime()) || (refreshed.refresh_token !== undefined && (typeof refreshed.refresh_token !== "string" || !/^\S+$/.test(refreshed.refresh_token))) || (refreshed.scope !== undefined && typeof refreshed.scope !== "string")) throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_FAILED", message: "Google did not return a usable refreshed token." });
          const refreshedScopes = typeof refreshed.scope === "string" ? refreshed.scope.split(/\s+/).filter(Boolean) : undefined;
          const grantValid = googleRefreshGrantValid(data);
          // RFC 6749: without a scope parameter, the request uses the original
          // refresh grant. Only use that fallback when it is bound to this token.
          const effectiveScopes = refreshedScopes ?? (grantValid ? data.refreshGrantScopes as string[] : undefined);
          const rotated = typeof refreshed.refresh_token === "string" && refreshed.refresh_token !== refreshToken;
          // Older records lack a refresh-grant proof. Preserve their existing
          // legacy behavior after refresh without granting scope-based writes.
          const legacyScopes = data.refreshGrantProof === undefined || (data.grantedScopes === undefined && data.scopeTokenHash === undefined);
          if (!legacyScopes && effectiveScopes && !requiredGoogleScopes(provider, effectiveScopes) && !rotated) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Google permissions are incomplete. Reconnect this account." });
          const trustedPrevious = grantValid || googleScopeProofValid(data);
          const verifiedRefresh = !legacyScopes && trustedPrevious && effectiveScopes !== undefined && googleScopesGranted(effectiveScopes, []);
          const nextRefreshToken = readString(refreshed.refresh_token) ?? refreshToken;
          // A provider-confirmed subset is a conservative bound on the original
          // grant. An expansion/replacement cannot establish a new refresh grant.
          const baseline = grantValid ? data.refreshGrantScopes as string[] : undefined;
          const narrowed = baseline && refreshedScopes && googleScopesGranted(refreshedScopes, []) && refreshedScopes.every((scope) => baseline.includes(scope));
          const nextGrantScopes = baseline && (!refreshedScopes || sameGoogleScopes(baseline, refreshedScopes)) ? baseline : narrowed ? refreshedScopes : undefined;
          const ambiguous = !legacyScopes && !nextGrantScopes;
          const capabilitiesValid = provider === CredentialProvider.GMAIL && gmailCapabilitiesValid(data);
          const chatManagementValid = provider === CredentialProvider.GOOGLE_CHAT_OAUTH && chatManageValid(data);
          const updated = {
            ...(legacyScopes ? withoutGoogleScopeEvidence(data) : data),
            ...(!legacyScopes && effectiveScopes ? { grantedScopes: effectiveScopes } : {}),
            ...(!legacyScopes ? { scopeTokenHash: verifiedRefresh ? googleScopeTokenHash(accessToken) : "", scopeProof: verifiedRefresh ? googleScopeProof(accessToken, effectiveScopes!) : "" } : {}),
            ...(data.refreshGrantProof !== undefined ? { refreshGrantScopes: nextGrantScopes ?? data.refreshGrantScopes, refreshGrantProof: nextGrantScopes ? googleRefreshGrantProof(nextRefreshToken, nextGrantScopes) : "" } : {}),
            ...(ambiguous || nextGrantScopes ? { refreshGrantAmbiguous: ambiguous } : {}),
            ...(!legacyScopes && provider === CredentialProvider.GMAIL && data.gmailCapabilityProof !== undefined ? { gmailCapabilityProof: capabilitiesValid ? gmailCapabilityProof(nextRefreshToken, data.gmailCapabilities as GmailCapability[]) : "" } : {}),
            ...(!legacyScopes && provider === CredentialProvider.GOOGLE_CHAT_OAUTH && data.chatManageProof !== undefined ? { chatManageProof: chatManagementValid ? chatManageProof(nextRefreshToken) : "" } : {}),
            accessToken,
            refreshToken: nextRefreshToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          };
          const result = await tx.credential.updateMany({ where: { id: credential.id, workspaceId, provider, encryptedData: credential.encryptedData }, data: { encryptedData: this.vault.encrypt(updated) } });
          if (result.count !== 1) {
            const current = await tx.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
            const latest = current && this.usableGoogleCredential(current, provider);
            if (latest) return { busy: false as const, credential: latest };
            throw new BadRequestException({ code: "GOOGLE_CREDENTIAL_CHANGED", message: "Google connection changed while refreshing. Try again." });
          }
          return { busy: false as const, credential: withoutGoogleScopeProof(updated, provider) };
          }, { maxWait, timeout: transactionTimeout });
        } catch (error) {
          if (!checkoutTimedOut(error, entered)) throw error;
          outcome = { busy: true };
        }
        if (!outcome.busy) {
          const refreshedCredential = outcome.credential;
          if (refreshedCredential.grantedScopes !== undefined && !requiredGoogleScopes(provider, refreshedCredential.grantedScopes)) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Google permissions are incomplete. Reconnect this account." });
          return refreshedCredential;
        }
        // No transaction or DB connection is held while the current lock owner
        // works. Reread before each jittered retry so completed work is reused.
        const latest = await reread();
        if (latest) return latest;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const wait = Math.min(remaining, Math.max(1, Math.floor(delayMs * (0.75 + Math.random() * 0.5))));
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
        delayMs = Math.min(delayMs * 2, 1000);
      }
      throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_BUSY", message: "Google connection is being refreshed. Try again." });
    } catch (error) {
      // A reconnect or the lock holder may have replaced the old token even if
      // this attempt timed out or Google rejected the stale refresh token.
      const latest = await reread();
      if (latest) return latest;
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new BadRequestException({ code: "GOOGLE_TOKEN_REFRESH_FAILED", message: "Google connection could not be refreshed. Try again or reconnect the account." });
    }
  }

  private usableGoogleCredential(credential: { encryptedData: string; provider: CredentialProvider; label: string }, provider: CredentialProvider) {
    const data = sanitizeGoogleScopeEvidence(this.vault.decrypt(credential.encryptedData), credential);
    const expiry = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
    const scopesValid = data.grantedScopes === undefined || requiredGoogleScopes(provider, data.grantedScopes);
    return typeof data.accessToken === "string" && /^\S+$/.test(data.accessToken) && Number.isFinite(expiry) && expiry > Date.now() + googleRefreshSkewMs && scopesValid ? withoutGoogleScopeProof(data, provider) : undefined;
  }

  async requireGoogleReconnectTarget(workspaceId: string, userId: string, kind: GoogleConnectionKind, credentialId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider: googleConnectionPolicy[kind].provider } });
    if (!credential || !isCanonicalGoogleOAuth(credential)) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching managed Google connection was not found in this workspace." });
    return credential;
  }

  async saveGoogleOAuth(workspaceId: string, userId: string, kind: GoogleConnectionKind, data: { accessToken: string; refreshToken: string; expiresAt: string; googleSubject: string; googleEmail: string; grantedScopes: string[]; scopeTokenHash: string }, credentialId?: string, gmailCapabilities?: GmailCapability[], chatManage?: boolean, allowUnverifiedLegacy = false) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const policy = googleConnectionPolicy[kind];
    if (!(kind === "gmail" ? gmailCapabilitiesGranted(data.grantedScopes, ["readonly"]) : kind === "chat" ? googleChatScopesGranted(data.grantedScopes) : googleScopesGranted(data.grantedScopes, policy.scopes))) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Required Google permissions were not granted. Existing connections were not changed." });
    if (data.scopeTokenHash !== googleScopeTokenHash(data.accessToken)) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_UNVERIFIED", message: "Google permissions could not be verified. Existing connections were not changed." });
    if (gmailCapabilities !== undefined && (kind !== "gmail" || !validGmailCapabilities(gmailCapabilities))) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Gmail permissions are invalid." });
    if (chatManage !== undefined && (kind !== "chat" || typeof chatManage !== "boolean")) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google Chat permissions are invalid." });
    if (chatManage && !googleScopesGranted(data.grantedScopes, [chatManageScope])) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Google Chat management permission was not granted." });
    const selected = kind === "gmail" ? gmailCapabilities ?? ["readonly" as const] : undefined;
    if (selected && !gmailCapabilitiesGranted(data.grantedScopes, selected)) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Required Gmail permissions were not granted. Existing connections were not changed." });
    const trustedData = { ...data, scopeProof: googleScopeProof(data.accessToken, data.grantedScopes), refreshGrantScopes: data.grantedScopes, refreshGrantProof: googleRefreshGrantProof(data.refreshToken, data.grantedScopes), ...(selected ? { gmailCapabilities: selected, gmailCapabilityProof: gmailCapabilityProof(data.refreshToken, selected) } : {}), ...(chatManage ? { chatManage: true, chatManageProof: chatManageProof(data.refreshToken) } : {}) };
    let credential;
    if (credentialId) {
      const target = await this.requireGoogleReconnectTarget(workspaceId, userId, kind, credentialId);
      const previous = this.vault.decrypt(target.encryptedData);
      // Legacy grants may expose OpenID identity on their current access token.
      // Never refresh a legacy token merely to probe identity: provider-side
      // rotation could invalidate it even if the reconnect is later rejected.
      const subject = typeof previous.googleSubject === "string" ? previous.googleSubject :
        typeof previous.accessToken === "string" && /^\S+$/.test(previous.accessToken) ? await googleSubject(previous.accessToken) : undefined;
      if (!subject && !allowUnverifiedLegacy) throw new BadRequestException({ code: "GOOGLE_OAUTH_LEGACY_IDENTITY_UNKNOWN", message: "This older connection's account cannot be verified. Its tokens were not changed." });
      if (subject && subject !== data.googleSubject) throw new BadRequestException({ code: "GOOGLE_OAUTH_ACCOUNT_MISMATCH", message: "Choose the Google account originally used for this connection. Its tokens were not changed." });
      const result = await this.prisma.credential.updateMany({ where: { id: target.id, workspaceId, provider: policy.provider, encryptedData: target.encryptedData }, data: { encryptedData: this.vault.encrypt(trustedData) } });
      if (result.count !== 1) throw new BadRequestException({ code: "GOOGLE_CREDENTIAL_CHANGED", message: "Google connection changed during reconnect. Try again." });
      credential = await this.prisma.credential.findFirst({ where: { id: target.id, workspaceId, provider: policy.provider } });
      if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    } else {
      // A random suffix keeps the existing workspace/provider/label uniqueness constraint
      // without exposing the stable subject or overwriting a concurrent connection.
      const label = `${policy.label} · ${data.googleEmail.slice(0, 35)} · ${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      credential = await this.prisma.credential.create({ data: { workspaceId, provider: policy.provider, label, encryptedData: this.vault.encrypt(trustedData) } });
    }
    await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.google_oauth_connected", targetType: "credential", targetId: credential.id } });
    return this.summary(credential);
  }

  private summary(credential: { id: string; provider: CredentialProvider; label: string; createdAt: Date; updatedAt: Date; encryptedData?: string }) {
    let hints: ReturnType<typeof credentialHints> = [];
    let selectedGmailCapabilities: GmailCapability[] | undefined;
    let chatManageEnabled = false;
    let googleReconnectRequired = false;
    let googleLegacyScopesUnverified = false;
    let googleIdentityUnverified = false;
    if (credential.encryptedData && isCanonicalGoogleOAuth(credential)) {
      try {
        const data = this.vault.decrypt(credential.encryptedData);
        googleIdentityUnverified = !(typeof data.googleSubject === "string" && data.googleSubject);
        if (credential.provider === CredentialProvider.GMAIL && gmailCapabilitiesValid(data)) selectedGmailCapabilities = data.gmailCapabilities as GmailCapability[];
        const chatManagementSelected = credential.provider === CredentialProvider.GOOGLE_CHAT_OAUTH && chatManageValid(data);
        if (chatManagementSelected && googleScopeProofValid(data) && googleScopesGranted(data.grantedScopes, [chatManageScope])) chatManageEnabled = true;
        const preProofLegacy = data.scopeProof === undefined && data.refreshGrantProof === undefined && data.gmailCapabilityProof === undefined;
        googleLegacyScopesUnverified = preProofLegacy;
        googleReconnectRequired = !preProofLegacy && (data.refreshGrantAmbiguous === true || (data.grantedScopes !== undefined && (!requiredGoogleScopes(credential.provider, data.grantedScopes) || !googleScopeProofValid(data))) || (chatManagementSelected && !chatManageEnabled));
      } catch { /* Keep listing usable when one credential is unreadable. */ }
    }
    if (credential.encryptedData && !isCanonicalGoogleOAuth(credential)) {
      try { hints = credentialHints(credential.provider, this.vault.decrypt(credential.encryptedData)); }
      catch { /* A malformed or old encrypted value must not prevent listing other connections. */ }
    }
    return {
      id: credential.id,
      provider: credential.provider,
      label: credential.label,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      isManaged: isCanonicalGoogleOAuth(credential),
      ...(selectedGmailCapabilities ? { gmailCapabilities: selectedGmailCapabilities } : {}),
      ...(chatManageEnabled ? { chatManageEnabled: true } : {}),
      ...(googleReconnectRequired ? { googleReconnectRequired: true } : {}),
      ...(googleLegacyScopesUnverified ? { googleLegacyScopesUnverified: true } : {}),
      ...(googleIdentityUnverified ? { googleIdentityUnverified: true } : {}),
      ...(hints.length ? { hints } : {}),
    };
  }
}

function requiredGoogleScopes(provider: CredentialProvider, scopes: unknown) {
  if (provider === CredentialProvider.GMAIL) return gmailCapabilitiesGranted(scopes, ["readonly"]);
  if (provider === CredentialProvider.GOOGLE_CHAT_OAUTH) return googleChatScopesGranted(scopes);
  const policy = Object.values(googleConnectionPolicy).find((item) => item.provider === provider);
  return !policy || googleScopesGranted(scopes, policy.scopes);
}

function withoutGoogleScopeProof(data: Record<string, unknown>, provider: CredentialProvider) {
  const result = { ...data };
  if (provider === CredentialProvider.GMAIL && Array.isArray(data.grantedScopes)) {
    const selected = gmailCapabilitiesValid(data) ? data.gmailCapabilities as GmailCapability[] : ["readonly" as const];
    result.grantedScopes = projectGmailScopes(data.grantedScopes, selected);
  }
  if (provider === CredentialProvider.GOOGLE_CHAT_OAUTH && Array.isArray(data.grantedScopes) && !chatManageValid(data)) {
    const hadManage = data.grantedScopes.includes(chatManageScope);
    result.grantedScopes = data.grantedScopes.filter((scope) => scope !== chatManageScope);
    if (hadManage && !(result.grantedScopes as unknown[]).includes("https://www.googleapis.com/auth/chat.messages.create")) (result.grantedScopes as unknown[]).push("https://www.googleapis.com/auth/chat.messages.create");
  }
  delete result.scopeProof;
  delete result.refreshGrantScopes;
  delete result.refreshGrantProof;
  delete result.refreshGrantAmbiguous;
  delete result.gmailCapabilities;
  delete result.gmailCapabilityProof;
  delete result.chatManage;
  delete result.chatManageProof;
  return result;
}

function withoutGoogleScopeEvidence(data: Record<string, unknown>) {
  const result = { ...data };
  for (const key of ["grantedScopes", "scopeTokenHash", "scopeProof", "refreshGrantScopes", "refreshGrantProof", "refreshGrantAmbiguous", "gmailCapabilities", "gmailCapabilityProof", "chatManage", "chatManageProof"]) delete result[key];
  return result;
}

function sanitizeGoogleScopeEvidence(data: Record<string, unknown>, credential: { provider: CredentialProvider; label: string }) {
  // Pre-proof credentials remain compatible with legacy reads but cannot claim
  // any scope-based privileges, regardless of their untrusted JSON metadata.
  if (data.scopeProof === undefined && data.refreshGrantProof === undefined && data.gmailCapabilityProof === undefined) return withoutGoogleScopeEvidence(data);
  // Manual JSON cannot establish either refresh-grant or capability evidence.
  if (!isCanonicalGoogleOAuth(credential)) return { ...data, scopeTokenHash: "", scopeProof: "", refreshGrantProof: "", gmailCapabilityProof: "" };
  if (!googleScopeProofValid(data)) return { ...data, scopeTokenHash: "", scopeProof: "" };
  return data;
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
    if (typeof data.projectRef !== "string" || !/^[a-z0-9]{10,40}$/.test(data.projectRef) || typeof data.apiKey !== "string" || !/^[A-Za-z0-9._-]{1,4096}$/.test(data.apiKey) || (data.managementToken !== undefined && (typeof data.managementToken !== "string" || (data.managementToken !== "" && !/^[A-Za-z0-9._-]{1,4096}$/.test(data.managementToken))))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Supabase project reference, API key and optional management token." });
    if (data.userAccessToken !== undefined && data.userAccessToken !== "" && (typeof data.userAccessToken !== "string" || data.userAccessToken.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.userAccessToken))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Supabase user access token (JWT)." });
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
    try { validatePostgresCredential(data); } catch (error) {
      if (error instanceof NodeFailure && error.code === "POSTGRES_CA_INVALID") throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid PostgreSQL CA certificate in PEM format." });
      throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid PostgreSQL connection." });
    }
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
