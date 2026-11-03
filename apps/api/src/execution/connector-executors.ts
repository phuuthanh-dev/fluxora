import type { ExecutableWorkflowNodeType } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { CredentialProvider } from "@prisma/client";
import type { ConnectorExecutor } from "./node-executor-contract";
import { NodeFailure } from "./node-failure";
import { readCredentialId } from "./connector-config";
import { mockSteamSnapshot, steamSnapshot } from "./steam-adapter";
import { mockDrive, executeGoogleDrive, mockSheets, executeGoogleSheets, readOperation } from "./google-workspace-adapter";
import { readDrivePageToken } from "./google-drive-pagination";
import { executeGoogleChatWebhook, executeDiscordWebhook, executeTelegramMessage } from "./notification-adapters";
import { executeGitHubCreateIssue, executeGitHubAddLabel, executeGitHubAddComment, executeGitHubMergePullRequest } from "./github-write-adapter";
import { executeHttpRequest } from "./http-request-adapter";
import { executeSmtpEmail } from "./smtp-email";
import { executeGeminiText } from "./gemini-text";
import { executeOpenAIText } from "./openai-text";
import { executeMongoFind, executeMongoInsert } from "./mongodb-find";
import { executeNotionSearch } from "./notion-search";
import { executeNotionOperation } from "./notion-operations";
import { executeRssRead } from "./rss-read";
import { executeTrelloCreateCard } from "./trello";
import { executeTrelloOperation } from "./trello-operations";
import { executeSentryListIssues } from "./sentry";
import { executeVercelListDeployments } from "./vercel";
import { executeSupabaseSelect } from "./supabase";
import { executeSentryGetIssue } from "./sentry-observability";
import { executeVercelPublicDeploymentLookup } from "./vercel-observability";
import { executeRedditListPosts } from "./reddit";
import { executePostgresSelect } from "./postgres-read";
import { executeGmailRead } from "./gmail-read";
import { executeGmailGetMessage } from "./gmail-get-message";
import { executeGmailWrite } from "./gmail-write";
import { executeGoogleCalendar, executeGoogleCalendarAvailability, executeGoogleCalendarCreate, executeGoogleCalendarEvent } from "./google-calendar";
import { executeGoogleChatEdit, executeGoogleChatOAuth } from "./google-chat-oauth";
import { executeTelegramMessageOperation } from "./telegram-message-operations";
import { executeGitHubGetIssue, executeGitHubGetPullRequest, executeGitHubListIssues, executeGitHubListPullRequests } from "./github-read";
import { executeGitHubUpdateIssue } from "./github-update-issue";

/** Server-only registry. Adapters retain validation, authorization, redaction
 * and retry semantics; registration is not a credential or policy bypass. */
const executors = {
  "action.steam.account-snapshot": async ({ config, mode, workspaceId, credentials }) => {
    if (mode === "live") {
      const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.STEAM);
      return { status: "succeeded", output: await steamSnapshot(credential, config), route: "success" };
    }
    return { status: "succeeded", output: mockSteamSnapshot(String(config.steamId ?? "76561198000000000")), route: "success" };
  },
  "action.google-chat.webhook": ({ config, mode, workspaceId, credentials }) => executeGoogleChatWebhook(config, mode, workspaceId, credentials),
  "action.discord.webhook": ({ config, mode, workspaceId, credentials }) => executeDiscordWebhook(config, mode, workspaceId, credentials),
  "action.telegram.message": ({ config, mode, workspaceId, credentials }) => executeTelegramMessage(config, mode, workspaceId, credentials),
  "action.github": ({ config, mode, workspaceId, credentials }) => executeGitHubCreateIssue(config, mode, workspaceId, credentials),
  "action.github.add-label": ({ config, mode, workspaceId, credentials }) => executeGitHubAddLabel(config, mode, workspaceId, credentials),
  "action.github.add-comment": ({ config, mode, workspaceId, credentials }) => executeGitHubAddComment(config, mode, workspaceId, credentials),
  "action.github.merge-pull-request": ({ config, mode, workspaceId, credentials }) => executeGitHubMergePullRequest(config, mode, workspaceId, credentials),
  "action.google-drive": ({ config, mode, workspaceId, credentials }) => executeDriveNode(config, mode, workspaceId, credentials, false),
  "action.google-drive.v2": ({ config, mode, workspaceId, credentials }) => executeDriveNode(config, mode, workspaceId, credentials, true),
  "action.google-sheets": async ({ config, mode, workspaceId, credentials }) => {
    if (mode === "mock") return { status: "succeeded", output: mockSheets(config), route: "success" };
    const credential = await credentials.readGoogleForExecution(readCredentialId(config), workspaceId);
    return { status: "succeeded", output: await executeGoogleSheets(credential, config), route: "success" };
  },
  "action.http-request": async ({ config, mode, workspaceId, credentials }) => {
    if (mode === "mock") return { status: "succeeded", output: { status: 200, body: { mocked: true, url: config.url ?? "", method: config.method ?? "GET" } }, route: "success" };
    const credential = typeof config.credentialId === "string" && config.credentialId ? await credentials.readForExecution(config.credentialId, workspaceId, CredentialProvider.HTTP) : undefined;
    return executeHttpRequest(config, credential);
  },
  "action.email": ({ config, mode, workspaceId, credentials }) => executeSmtpEmail(config, mode, workspaceId, credentials),
  "action.gemini": ({ config, mode, workspaceId, credentials }) => executeGeminiText(config, mode, workspaceId, credentials),
  "action.openai": ({ config, mode, workspaceId, credentials }) => executeOpenAIText(config, mode, workspaceId, credentials),
  "action.mongodb": ({ config, mode, workspaceId, credentials }) => executeMongoFind(config, mode, workspaceId, credentials),
  "action.mongodb.insert": ({ config, mode, workspaceId, credentials }) => executeMongoInsert(config, mode, workspaceId, credentials),
  "action.notion.search-pages": ({ config, mode, workspaceId, credentials }) => executeNotionSearch(config, mode, workspaceId, credentials, undefined, 1),
  "action.notion.search-pages.v2": ({ config, mode, workspaceId, credentials }) => executeNotionSearch(config, mode, workspaceId, credentials, undefined, 2),
  "action.notion.retrieve-page": ({ config, mode, workspaceId, credentials }) => executeNotionOperation(config, "retrievePage", mode, workspaceId, credentials),
  "action.notion.list-children": ({ config, mode, workspaceId, credentials }) => executeNotionOperation(config, "listChildren", mode, workspaceId, credentials),
  "action.notion.retrieve-property": ({ config, mode, workspaceId, credentials }) => executeNotionOperation(config, "retrieveProperty", mode, workspaceId, credentials),
  "action.rss.read": ({ config, mode }) => executeRssRead(config, mode),
  "action.trello.create-card": ({ config, mode, workspaceId, credentials }) => executeTrelloCreateCard(config, mode, workspaceId, credentials),
  "action.trello.get-card": ({ config, mode, workspaceId, credentials }) => executeTrelloOperation("get", config, mode, workspaceId, credentials),
  "action.trello.update-card": ({ config, mode, workspaceId, credentials }) => executeTrelloOperation("update", config, mode, workspaceId, credentials),
  "action.trello.move-card": ({ config, mode, workspaceId, credentials }) => executeTrelloOperation("move", config, mode, workspaceId, credentials),
  "action.trello.archive-card": ({ config, mode, workspaceId, credentials }) => executeTrelloOperation("archive", config, mode, workspaceId, credentials),
  "action.trello.list-cards": ({ config, mode, workspaceId, credentials }) => executeTrelloOperation("list", config, mode, workspaceId, credentials),
  "action.trello.find-cards": ({ config, mode, workspaceId, credentials }) => executeTrelloOperation("find", config, mode, workspaceId, credentials),
  "action.sentry.list-issues": ({ config, mode, workspaceId, credentials }) => executeSentryListIssues(config, mode, workspaceId, credentials, undefined, 1),
  "action.sentry.list-issues.v2": ({ config, mode, workspaceId, credentials }) => executeSentryListIssues(config, mode, workspaceId, credentials, undefined, 2),
  "action.sentry.get-issue": ({ config, mode, workspaceId, credentials }) => executeSentryGetIssue(config, mode, workspaceId, credentials),
  "action.vercel.list-deployments": ({ config, mode, workspaceId, credentials }) => executeVercelListDeployments(config, mode, workspaceId, credentials, undefined, 1),
  "action.vercel.list-deployments.v2": ({ config, mode, workspaceId, credentials }) => executeVercelListDeployments(config, mode, workspaceId, credentials, undefined, 2),
  "action.vercel.public-deployment-lookup": ({ config, mode, workspaceId, credentials }) => executeVercelPublicDeploymentLookup(config, mode, workspaceId, credentials),
  "action.supabase.select": ({ config, mode, workspaceId, credentials }) => executeSupabaseSelect(config, mode, workspaceId, credentials, undefined, 1),
  "action.supabase.select.v2": ({ config, mode, workspaceId, credentials }) => executeSupabaseSelect(config, mode, workspaceId, credentials, undefined, 2),
  "action.reddit.list-posts": ({ config, mode, workspaceId, credentials }) => executeRedditListPosts(config, mode, workspaceId, credentials),
  "action.postgres.select": ({ config, mode, workspaceId, credentials }) => executePostgresSelect(config, mode, workspaceId, credentials, undefined, 1),
  "action.postgres.select.v2": ({ config, mode, workspaceId, credentials }) => executePostgresSelect(config, mode, workspaceId, credentials, undefined, 2),
  "action.gmail.read": ({ config, mode, workspaceId, credentials }) => executeGmailRead(config, mode, workspaceId, credentials, undefined, 1),
  "action.gmail.read.v2": ({ config, mode, workspaceId, credentials }) => executeGmailRead(config, mode, workspaceId, credentials, undefined, 2),
  "action.gmail.get-message": ({ config, mode, workspaceId, credentials }) => executeGmailGetMessage(config, mode, workspaceId, credentials),
  "action.gmail.send": ({ config, mode, workspaceId, credentials }) => executeGmailWrite(config, "send", mode, workspaceId, credentials),
  "action.gmail.reply": ({ config, mode, workspaceId, credentials }) => executeGmailWrite(config, "reply", mode, workspaceId, credentials),
  "action.gmail.create-draft": ({ config, mode, workspaceId, credentials }) => executeGmailWrite(config, "draft", mode, workspaceId, credentials),
  "action.gmail.update-draft": ({ config, mode, workspaceId, credentials }) => executeGmailWrite(config, "updateDraft", mode, workspaceId, credentials),
  "action.gmail.modify-label": ({ config, mode, workspaceId, credentials }) => executeGmailWrite(config, "label", mode, workspaceId, credentials),
  "action.google-calendar.list-events": ({ config, mode, workspaceId, credentials }) => executeGoogleCalendar(config, mode, workspaceId, credentials),
  "action.google-calendar.create-event": ({ config, mode, workspaceId, credentials, executionId, nodeId }) => executeGoogleCalendarCreate(config, mode, workspaceId, credentials, executionId, nodeId),
  "action.google-calendar.get-event": ({ config, mode, workspaceId, credentials }) => executeGoogleCalendarEvent(config, "get", mode, workspaceId, credentials),
  "action.google-calendar.update-event": ({ config, mode, workspaceId, credentials }) => executeGoogleCalendarEvent(config, "update", mode, workspaceId, credentials),
  "action.google-calendar.delete-event": ({ config, mode, workspaceId, credentials }) => executeGoogleCalendarEvent(config, "delete", mode, workspaceId, credentials),
  "action.google-calendar.availability": ({ config, mode, workspaceId, credentials }) => executeGoogleCalendarAvailability(config, mode, workspaceId, credentials),
  "action.google-chat.oauth": ({ config, mode, workspaceId, credentials }) => executeGoogleChatOAuth(config, mode, workspaceId, credentials),
  "action.google-chat.oauth.v2": ({ config, mode, workspaceId, credentials }) => executeGoogleChatOAuth(config, mode, workspaceId, credentials, undefined, "send"),
  "action.google-chat.reply": ({ config, mode, workspaceId, credentials }) => executeGoogleChatOAuth(config, mode, workspaceId, credentials, undefined, "reply"),
  "action.google-chat.edit-message": ({ config, mode, workspaceId, credentials }) => executeGoogleChatEdit(config, mode, workspaceId, credentials),
  "action.telegram.reply": ({ config, mode, workspaceId, credentials }) => executeTelegramMessageOperation("reply", config, mode, workspaceId, credentials),
  "action.telegram.edit-message": ({ config, mode, workspaceId, credentials }) => executeTelegramMessageOperation("edit", config, mode, workspaceId, credentials),
  "action.github.list-issues": ({ config, mode, workspaceId, credentials }) => executeGitHubListIssues(config, mode, workspaceId, credentials),
  "action.github.get-issue": ({ config, mode, workspaceId, credentials }) => executeGitHubGetIssue(config, mode, workspaceId, credentials),
  "action.github.update-issue": ({ config, mode, workspaceId, credentials }) => executeGitHubUpdateIssue(config, mode, workspaceId, credentials),
  "action.github.list-pull-requests": ({ config, mode, workspaceId, credentials }) => executeGitHubListPullRequests(config, mode, workspaceId, credentials),
  "action.github.get-pull-request": ({ config, mode, workspaceId, credentials }) => executeGitHubGetPullRequest(config, mode, workspaceId, credentials),
} satisfies Record<Extract<ExecutableWorkflowNodeType, `action.${string}`>, ConnectorExecutor>;

async function executeDriveNode(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, paginated: boolean) {
  if (paginated && Object.hasOwn(config, "operation") && (typeof config.operation !== "string" || !["list", "search", "uploadText", "downloadText"].includes(config.operation))) {
    throw new NodeFailure("INVALID_INPUT", "Choose a valid Google Drive operation.", false);
  }
  const operation = readOperation(config, ["list", "search", "uploadText", "downloadText"], "list");
  if (paginated && operation === "search" && Object.hasOwn(config, "query") && typeof config.query !== "string") {
    throw new NodeFailure("INVALID_INPUT", "Google Drive search could not be resolved.", false);
  }
  if (paginated && (operation === "list" || operation === "search")) readDrivePageToken(config);
  if (mode === "mock") return { status: "succeeded" as const, output: mockDrive(config, paginated), route: "success" as const };
  const credential = await credentials.readGoogleForExecution(readCredentialId(config), workspaceId);
  return { status: "succeeded" as const, output: await executeGoogleDrive(credential, config, paginated), route: "success" as const };
}

export const registeredConnectorNodeTypes = Object.freeze(Object.keys(executors) as Array<keyof typeof executors>);
export function getConnectorExecutor(type: string): ConnectorExecutor | undefined {
  return Object.hasOwn(executors, type) ? executors[type as keyof typeof executors] : undefined;
}
