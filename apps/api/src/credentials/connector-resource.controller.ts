import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { listMongoCollections, listMongoDatabases } from "../execution/mongodb-find";
import { listGoogleChatSpaces } from "../execution/google-chat-oauth";
import { listPostgresSchemas, listPostgresTables, validatePostgresCredential } from "../execution/postgres-read";
import { listTrelloBoards, listTrelloLists } from "../execution/trello";
import { listSentryOrganizations, listSentryProjects } from "../execution/sentry";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId")
@UseGuards(AuthenticationGuard)
export class ConnectorResourceController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("sentry/organizations")
  async sentryOrganizations(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SENTRY);
    try { return await listSentryOrganizations(credential); }
    catch { throw new BadRequestException({ code: "SENTRY_ORGANIZATIONS_UNAVAILABLE", message: "Organizations could not be loaded. Check your connection, region and permissions, or enter a slug manually." }); }
  }

  @Get("sentry/projects")
  async sentryProjects(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("organization") organization: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SENTRY);
    try { return await listSentryProjects(credential, organization ?? ""); }
    catch { throw new BadRequestException({ code: "SENTRY_PROJECTS_UNAVAILABLE", message: "Projects could not be loaded. Check your organization and permissions, or enter a slug manually." }); }
  }

  @Get("trello/boards")
  async trelloBoards(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TRELLO);
    try { return await listTrelloBoards(credential); }
    catch { throw new BadRequestException({ code: "TRELLO_BOARDS_UNAVAILABLE", message: "Boards could not be loaded. Check your Trello connection or enter a board ID manually." }); }
  }

  @Get("trello/lists")
  async trelloLists(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("board") board: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TRELLO);
    try { return await listTrelloLists(credential, board ?? ""); }
    catch { throw new BadRequestException({ code: "TRELLO_LISTS_UNAVAILABLE", message: "Lists could not be loaded. Check your board and connection or enter a list ID manually." }); }
  }

  @Get("postgres/schemas")
  async postgresSchemas(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.POSTGRES);
    try { return await listPostgresSchemas(validatePostgresCredential(credential)); }
    catch { throw new BadRequestException({ code: "POSTGRES_SCHEMAS_UNAVAILABLE", message: "Schemas could not be loaded. Check your connection or enter a schema manually." }); }
  }

  @Get("postgres/tables")
  async postgresTables(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("schema") schema: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.POSTGRES);
    try { return await listPostgresTables(validatePostgresCredential(credential), schema ?? ""); }
    catch { throw new BadRequestException({ code: "POSTGRES_TABLES_UNAVAILABLE", message: "Tables could not be loaded. Check permissions or enter a table manually." }); }
  }

  @Get("mongodb/databases")
  async mongoDatabases(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.MONGODB);
    try { return await listMongoDatabases(credential); }
    catch { throw new BadRequestException({ code: "MONGODB_DATABASES_UNAVAILABLE", message: "Databases could not be loaded. Check permissions or enter a database manually." }); }
  }

  @Get("mongodb/collections")
  async mongoCollections(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("database") database: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.MONGODB);
    try { return await listMongoCollections(credential, database ?? ""); }
    catch { throw new BadRequestException({ code: "MONGODB_COLLECTIONS_UNAVAILABLE", message: "Collections could not be loaded. Check the connection, database and permissions, or enter a collection manually." }); }
  }

  @Get("google-chat/spaces")
  async chatSpaces(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CHAT_OAUTH);
    const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
    if (!token || /\s/.test(token)) throw new BadRequestException({ code: "GOOGLE_CHAT_CREDENTIAL_INVALID", message: "Google Chat connection is missing an access token." });
    try { return await listGoogleChatSpaces(token); }
    catch { throw new BadRequestException({ code: "GOOGLE_CHAT_SPACES_UNAVAILABLE", message: "Spaces could not be loaded. Check the connection and permissions, or enter a space manually." }); }
  }
}
