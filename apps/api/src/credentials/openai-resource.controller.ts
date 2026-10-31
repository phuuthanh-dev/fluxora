import { BadRequestException, Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { listOpenAIModels } from "../execution/openai-text";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/openai")
@UseGuards(AuthenticationGuard)
export class OpenAIResourceController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("models")
  async models(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.OPENAI);
    const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
    try { return await listOpenAIModels(apiKey); } catch {
      throw new BadRequestException({ code: "OPENAI_MODELS_UNAVAILABLE", message: "OpenAI models could not be loaded. Check the connection and try again." });
    }
  }
}
