import { BadRequestException, Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { listGeminiTextModels } from "../execution/gemini-text";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/gemini")
@UseGuards(AuthenticationGuard)
export class GeminiResourceController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("models")
  async models(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GEMINI);
    const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
    try {
      return await listGeminiTextModels(apiKey);
    } catch {
      throw new BadRequestException({ code: "GEMINI_MODELS_UNAVAILABLE", message: "Gemini models could not be loaded. Check the connection and try again." });
    }
  }
}
