import { CredentialProvider } from "@prisma/client";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { CredentialVaultService } from "./credential-vault.service";

const providers = new Set(Object.values(CredentialProvider));

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

  async create(workspaceId: string, userId: string, input: { provider: string; label: string; data: unknown }) {
    await this.workspaces.requireOwner(workspaceId, userId);
    if (!providers.has(input.provider as CredentialProvider)) throw new NotFoundException({ code: "CREDENTIAL_PROVIDER_NOT_FOUND", message: "Credential provider is not supported." });
    if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) throw new NotFoundException({ code: "INVALID_INPUT", message: "Credential data must be a JSON object." });
    const credential = await this.prisma.credential.create({
      data: { workspaceId, provider: input.provider as CredentialProvider, label: input.label, encryptedData: this.vault.encrypt(input.data as Record<string, unknown>) },
    });
    await this.prisma.auditLog.create({ data: { workspaceId, actorId: userId, action: "credential.created", targetType: "credential", targetId: credential.id, metadata: { provider: credential.provider, label: credential.label } } });
    return this.summary(credential);
  }

  async readForExecution(credentialId: string, workspaceId: string, provider: CredentialProvider) {
    const credential = await this.prisma.credential.findFirst({ where: { id: credentialId, workspaceId, provider } });
    if (!credential) throw new NotFoundException({ code: "CREDENTIAL_NOT_FOUND", message: "A matching credential was not found in this workspace." });
    return this.vault.decrypt(credential.encryptedData);
  }

  private summary(credential: { id: string; provider: CredentialProvider; label: string; createdAt: Date; updatedAt: Date }) {
    return { id: credential.id, provider: credential.provider, label: credential.label, createdAt: credential.createdAt, updatedAt: credential.updatedAt };
  }
}
