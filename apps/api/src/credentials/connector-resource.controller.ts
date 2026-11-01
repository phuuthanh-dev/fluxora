import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { listMongoCollections, listMongoDatabases } from "../execution/mongodb-find";
import { listGoogleChatSpaces } from "../execution/google-chat-oauth";
import { listPostgresSchemas, listPostgresTables, validatePostgresCredential } from "../execution/postgres-read";
import { listTrelloBoards, listTrelloLists } from "../execution/trello";
import { listSentryOrganizations, listSentryProjects } from "../execution/sentry";
import { listVercelProjects, listVercelTeams } from "../execution/vercel";
import { listSupabaseTables } from "../execution/supabase";
import { CredentialService } from "./credential.service";
import { NodeFailure } from "../execution/node-failure";

export function trelloDiscoveryError(error: unknown, resource: "boards" | "lists") {
  const prefix = resource === "boards" ? "Boards" : "Lists";
  let guidance = "Check your connection or enter the ID manually.";
  if (error instanceof NodeFailure) {
    if (error.code === "CREDENTIAL_INVALID") guidance = "The Trello API key or token is missing or has an invalid format. Update the connection and retry.";
    else if (error.statusCode === 401) guidance = "Trello rejected the API key or token. Check that both belong to the same app and are still valid.";
    else if (error.statusCode === 403) guidance = "Trello denied access. Check the token permissions and access to this board.";
    else if (error.statusCode === 429) guidance = "Trello rate limited the request. Wait and retry.";
    else if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") guidance = "The Trello request could not reach the provider. Check network access and retry.";
  }
  return new BadRequestException({ code: resource === "boards" ? "TRELLO_BOARDS_UNAVAILABLE" : "TRELLO_LISTS_UNAVAILABLE", message: `${prefix} could not be loaded. ${guidance}` });
}

export function supabaseDiscoveryError(error: unknown) {
  if (error instanceof NodeFailure && error.code === "SUPABASE_MANAGEMENT_AUTH_FAILED") {
    return new BadRequestException({ code: "SUPABASE_TABLES_UNAVAILABLE", message: "Supabase denied the management token. Check its project access and database read permission, or enter the table name manually." });
  }
  if (error instanceof NodeFailure && (error.code === "SUPABASE_DISCOVERY_RESTRICTED" || error.statusCode === 403)) {
    return new BadRequestException({ code: "SUPABASE_DISCOVERY_RESTRICTED", message: "Supabase denied schema discovery. Publishable and anon keys can still read permitted rows; enter the table name manually." });
  }
  let guidance = "Check the connection or enter the table name manually.";
  if (error instanceof NodeFailure) {
    if (error.code === "CREDENTIAL_INVALID" || error.statusCode === 401) guidance = "Check the project reference and API key, or enter the table name manually.";
    else if (error.statusCode === 429) guidance = "Supabase rate limited the request. Retry later or enter the table name manually.";
    else if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") guidance = "Supabase could not be reached. Retry or enter the table name manually.";
  }
  return new BadRequestException({ code: "SUPABASE_TABLES_UNAVAILABLE", message: `Tables could not be listed. ${guidance}` });
}

@Controller("workspaces/:workspaceId/credentials/:credentialId")
@UseGuards(AuthenticationGuard)
export class ConnectorResourceController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("supabase/tables")
  async supabaseTables(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SUPABASE);
    try { return await listSupabaseTables(credential); }
    catch (error) { throw supabaseDiscoveryError(error); }
  }

  @Get("vercel/teams")
  async vercelTeams(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.VERCEL);
    try { return await listVercelTeams(credential); }
    catch { throw new BadRequestException({ code: "VERCEL_TEAMS_UNAVAILABLE", message: "Accounts and teams could not be loaded. Check your connection or enter a team ID manually." }); }
  }

  @Get("vercel/projects")
  async vercelProjects(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("team") team: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.VERCEL);
    try { return await listVercelProjects(credential, team ?? ""); }
    catch { throw new BadRequestException({ code: "VERCEL_PROJECTS_UNAVAILABLE", message: "Projects could not be loaded. Check your account and permissions, or enter a project ID manually." }); }
  }

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
    catch (error) { throw trelloDiscoveryError(error, "boards"); }
  }

  @Get("trello/lists")
  async trelloLists(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("board") board: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TRELLO);
    try { return await listTrelloLists(credential, board ?? ""); }
    catch (error) { throw trelloDiscoveryError(error, "lists"); }
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
