import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspaceModule } from "../workspaces/workspace.module";
import { CredentialController } from "./credential.controller";
import { CredentialService } from "./credential.service";
import { CredentialVaultService } from "./credential-vault.service";
import { GoogleOAuthController } from "./google-oauth.controller";

@Module({
  imports: [AuthModule, WorkspaceModule],
  controllers: [CredentialController, GoogleOAuthController],
  providers: [CredentialService, CredentialVaultService],
  exports: [CredentialService],
})
export class CredentialModule {}
