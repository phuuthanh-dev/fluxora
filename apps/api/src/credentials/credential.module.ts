import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspaceModule } from "../workspaces/workspace.module";
import { CredentialController } from "./credential.controller";
import { CredentialService } from "./credential.service";
import { CredentialVaultService } from "./credential-vault.service";
import { GoogleOAuthController } from "./google-oauth.controller";
import { GitHubResourceController } from "./github-resource.controller";
import { GitHubResourceService } from "./github-resource.service";
import { GoogleResourceController } from "./google-resource.controller";
import { GoogleResourceService } from "./google-resource.service";
import { GeminiResourceController } from "./gemini-resource.controller";
import { OpenAIResourceController } from "./openai-resource.controller";

@Module({
  imports: [AuthModule, WorkspaceModule],
  controllers: [CredentialController, GoogleOAuthController, GitHubResourceController, GoogleResourceController, GeminiResourceController, OpenAIResourceController],
  providers: [CredentialService, CredentialVaultService, GitHubResourceService, GoogleResourceService],
  exports: [CredentialService, CredentialVaultService],
})
export class CredentialModule {}
