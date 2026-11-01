import { BadRequestException, Controller, Delete, Get, Header, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials")
@UseGuards(AuthenticationGuard)
export class CredentialController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { credentials: await this.credentials.list(workspaceId, userId(request)) };
  }

  @Post()
  @Header("Cache-Control", "no-store")
  async create(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    const body = readBody(request.body);
    return { credential: await this.credentials.create(workspaceId, userId(request), {
      provider: readString(body.provider, "Credential provider", 1, 80),
      label: readString(body.label, "Credential label", 1, 80),
      data: body.data,
    }) };
  }

  @Get(":credentialId/references")
  async references(
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { references: await this.credentials.references(workspaceId, credentialId, userId(request)) };
  }

  @Patch(":credentialId")
  @Header("Cache-Control", "no-store")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const body = readBody(request.body);
    const label = body.label === undefined ? undefined : readString(body.label, "Credential label", 1, 80);
    const data = body.data;
    if (label === undefined && data === undefined) {
      throw new BadRequestException({ code: "INVALID_INPUT", message: "Provide a label or secret data to update." });
    }
    return {
      credential: await this.credentials.update(workspaceId, credentialId, userId(request), { label, data }),
    };
  }

  @Delete(":credentialId")
  async delete(
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.credentials.delete(workspaceId, credentialId, userId(request));
  }
}

function userId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}

function readBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_INPUT", message: "A JSON object is required." });
  return value as Record<string, unknown>;
}

function readString(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new BadRequestException({ code: "INVALID_INPUT", message: `${label} must be between ${min} and ${max} characters.` });
  return value.trim();
}
