import { jiraSearch, jiraCreate, jiraGet, jiraUpdate, jiraComment, jiraTrigger } from "./node-config-schemas/jira";
import { airtableList, airtableGet, airtableCreate, airtableUpdate } from "./node-config-schemas/airtable";
import { gitlabProject, gitlabListIssues, gitlabIssue, gitlabCreateIssue, gitlabComment, gitlabPipeline, gitlabMergeRequest, gitlabUpdateIssue, gitlabGetPipeline, gitlabGetMergeRequest } from "./node-config-schemas/gitlab";
import { aggregate, splitOut, sortItems, limitItems, merge } from "./node-config-schemas/data-transform";
import { steamOperation, steamSnapshot } from "./node-config-schemas/steam";
import { mongoFind, mongoInsert } from "./node-config-schemas/mongodb";
import { gemini } from "./node-config-schemas/gemini";
import { openai } from "./node-config-schemas/openai";
import { httpRequest } from "./node-config-schemas/http";
import { googleChatEdit, googleChatReply, googleChatSend, googleChatWebhook } from "./node-config-schemas/google-chat";
import { githubAddComment, githubAddLabel, githubCreateIssue, githubGetIssue, githubGetPullRequest, githubList, githubMerge, githubUpdateIssue } from "./node-config-schemas/github";
import { rssRead } from "./node-config-schemas/rss";
import { redditList } from "./node-config-schemas/reddit";
import { smtpEmail } from "./node-config-schemas/smtp";
import { sentryGetIssue, sentryListIssues } from "./node-config-schemas/sentry";
import { vercelListDeployments, vercelPublicDeployment } from "./node-config-schemas/vercel";
import { drive, driveCreateFolder, driveGetFile } from "./node-config-schemas/google-drive";
import { googleSheets } from "./node-config-schemas/google-sheets";
import { telegramEdit, telegramReply, telegramSend } from "./node-config-schemas/telegram";
import { trelloCreate, trelloFind, trelloGet, trelloList, trelloMove, trelloUpdate } from "./node-config-schemas/trello";
import { notionAppend, notionCreateEntry, notionUpdateEntry, notionChildren, notionCreate, notionPage, notionProperty, notionQuery, notionSearch, notionUpdate } from "./node-config-schemas/notion";
import { gmailGet, gmailLabel, gmailRead, gmailReply, gmailSend, gmailUpdateDraft } from "./node-config-schemas/gmail";
import { calendarAvailability, calendarCreate, calendarEvent, calendarList, calendarUpdate } from "./node-config-schemas/google-calendar";
import { postgresSelect, postgresInsert, postgresUpsert, supabaseInsert, supabaseSelect } from "./node-config-schemas/relational";
import { riotLol, riotTft } from "./node-config-schemas/riot";
import { slackMessage, slackUpdateMessage, slackWebhook, slackTrigger } from "./node-config-schemas/slack";
import { discordWebhook } from "./node-config-schemas/discord";
import { calendarTrigger, notionTrigger, driveTrigger, sheetsTrigger, cron, githubTrigger, gmailTrigger, manual, rssTrigger, steamNewsTrigger, sentryTrigger, telegramTrigger, trelloTrigger, uptimeTrigger, vercelTrigger, webhookTrigger } from "./node-config-schemas/triggers";
import { approval, editFields, ifCondition, switchCondition } from "./node-config-schemas/flow";
import type { ConfigRules, NodeConfigIssue } from "./node-config-schemas/types";

export type { NodeConfigIssue } from "./node-config-schemas/types";
export { isSteamAppId, isSteamId, parseSteamVanity } from "./node-config-schemas/steam";
export { isMongoCollection, isMongoDatabase, parseMongoObject } from "./node-config-schemas/mongodb";
export { isSentryCursor } from "./node-config-schemas/sentry";
export { validNotionCursor } from "./node-config-schemas/notion";
export { isCalendarResourceId } from "./node-config-schemas/google-calendar";

// Only migrated nodes appear here. Missing entries are not validation claims.
const rules: Readonly<Record<string, ConfigRules>> = {
  "action.airtable.list-records": airtableList,
  "action.airtable.get-record": airtableGet,
  "action.airtable.create-record": airtableCreate,
  "action.airtable.update-record": airtableUpdate,
  "trigger.notion.page": notionTrigger,
  "trigger.google-drive.file": driveTrigger,
  "trigger.google-sheets.row": sheetsTrigger,
  "action.steam.account-snapshot": steamSnapshot,
  "action.steam": steamOperation,
  "action.mongodb": mongoFind,
  "action.mongodb.insert": mongoInsert,
  "action.gemini": gemini,
  "action.openai": openai,
  "action.http-request": httpRequest,
  "action.google-chat.webhook": googleChatWebhook,
  "action.google-chat.oauth": googleChatSend,
  "action.google-chat.reply": googleChatReply,
  "action.google-chat.edit-message": googleChatEdit,
  "action.github": githubCreateIssue,
  "action.github.add-label": githubAddLabel,
  "action.github.add-comment": githubAddComment,
  "action.github.merge-pull-request": githubMerge,
  "action.github.list-issues": githubList,
  "action.github.get-issue": githubGetIssue,
  "action.github.update-issue": githubUpdateIssue,
  "action.github.list-pull-requests": githubList,
  "action.github.get-pull-request": githubGetPullRequest,
  "action.rss.read": rssRead,
  "action.reddit.list-posts": redditList,
  "action.email": smtpEmail,
  "action.sentry.list-issues": sentryListIssues,
  "action.sentry.get-issue": sentryGetIssue,
  "action.vercel.list-deployments": vercelListDeployments,
  "action.vercel.public-deployment-lookup": vercelPublicDeployment,
  "action.google-drive.get-file": driveGetFile,
  "action.google-drive.create-folder": driveCreateFolder,
  "action.google-drive": drive,
  "action.google-sheets": googleSheets,
  "action.telegram.message": telegramSend,
  "action.telegram.reply": telegramReply,
  "action.telegram.edit-message": telegramEdit,
  "action.trello.create-card": trelloCreate,
  "action.trello.get-card": trelloGet,
  "action.trello.update-card": trelloUpdate,
  "action.trello.move-card": trelloMove,
  "action.trello.archive-card": trelloGet,
  "action.trello.list-cards": trelloList,
  "action.trello.find-cards": trelloFind,
  "action.notion.search-pages": notionSearch,
  "action.notion.retrieve-page": notionPage,
  "action.notion.list-children": notionChildren,
  "action.notion.retrieve-property": notionProperty,
  "action.notion.query-data-source": notionQuery,
  "action.notion.create-entry": notionCreateEntry,
  "action.notion.update-entry": notionUpdateEntry,
  "action.notion.create-page": notionCreate,
  "action.notion.update-title": notionUpdate,
  "action.notion.append-block": notionAppend,
  "action.gmail.read": gmailRead,
  "action.gmail.get-message": gmailGet,
  "action.gmail.send": gmailSend,
  "action.gmail.reply": gmailReply,
  "action.gmail.create-draft": gmailSend,
  "action.gmail.update-draft": gmailUpdateDraft,
  "action.gmail.modify-label": gmailLabel,
  "action.google-calendar.list-events": calendarList,
  "action.google-calendar.create-event": calendarCreate,
  "action.google-calendar.get-event": calendarEvent,
  "action.google-calendar.update-event": calendarUpdate,
  "action.google-calendar.delete-event": calendarEvent,
  "action.google-calendar.availability": calendarAvailability,
  "action.postgres.select": postgresSelect,
  "action.postgres.insert-row": postgresInsert,
  "action.postgres.upsert-row": postgresUpsert,
  "action.supabase.select": supabaseSelect,
  "action.supabase.insert-row": supabaseInsert,
  "action.riot-lol": riotLol,
  "action.riot-tft": riotTft,
  "action.discord.webhook": discordWebhook,
  "action.slack.webhook": slackWebhook,
  "action.slack.message": slackMessage,
  "action.slack.update-message": slackUpdateMessage,
  "action.jira.search-issues": jiraSearch,
  "trigger.jira.issue": jiraTrigger,
  "action.jira.create-issue": jiraCreate,
  "action.jira.get-issue": jiraGet,
  "action.jira.update-issue": jiraUpdate,
  "action.jira.add-comment": jiraComment,
  "action.gitlab.get-project": gitlabProject,
  "action.gitlab.list-issues": gitlabListIssues,
  "action.gitlab.get-issue": gitlabIssue,
  "action.gitlab.create-issue": gitlabCreateIssue,
  "action.gitlab.add-comment": gitlabComment,
  "action.gitlab.update-issue": gitlabUpdateIssue,
  "action.gitlab.get-pipeline": gitlabGetPipeline,
  "action.gitlab.get-merge-request": gitlabGetMergeRequest,
  "trigger.gitlab.pipeline": gitlabPipeline,
  "trigger.gitlab.merge-request": gitlabMergeRequest,
  "trigger.slack.event": slackTrigger,
  "trigger.manual": manual,
  "trigger.cron": cron,
  "trigger.webhook": webhookTrigger,
  "trigger.gmail": gmailTrigger,
  "trigger.google-calendar.event": calendarTrigger,
  "trigger.rss.new-item": rssTrigger,
  "trigger.steam.game-news": steamNewsTrigger,
  "trigger.telegram.update": telegramTrigger,
  "trigger.vercel.deployment": vercelTrigger,
  "trigger.trello.board-action": trelloTrigger,
  "trigger.sentry.issue-created": sentryTrigger,
  "trigger.uptime-kuma.alert": uptimeTrigger,
  "trigger.github.issue-opened": githubTrigger,
  "trigger.github.pull-request-opened": githubTrigger,
  "trigger.github.push": githubTrigger,
  "trigger.github.workflow-run-completed": githubTrigger,
  "condition.if": ifCondition,
  "condition.switch": switchCondition,
  "action.edit-fields": editFields,
  "action.merge": merge,
  "action.aggregate": aggregate,
  "action.split-out": splitOut,
  "action.sort": sortItems,
  "action.limit": limitItems,
  "approval.request": approval,
};

export function hasNodeConfigSchema(type: string): boolean {
  return Object.hasOwn(rules, type);
}

function containsExpression(value: unknown): boolean {
  const pending = [value];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string" && /{{\s*[^{}]+?\s*}}/.test(item)) return true;
    if (item && typeof item === "object" && !seen.has(item)) {
      seen.add(item);
      for (const child of Object.values(item)) pending.push(child);
    }
  }
  return false;
}

/** Static checks defer expressions; resolved checks reject missing expression values. */
export function nodeConfigIssues(type: string, config: Record<string, unknown>, phase: "static" | "resolved"): NodeConfigIssue[] {
  const nodeRules = Object.hasOwn(rules, type) ? rules[type] : undefined;
  const issues: NodeConfigIssue[] = [];
  if (["action.merge", "action.aggregate", "action.split-out", "action.sort", "action.limit"].includes(type) && containsExpression(config)) return [{ field: "config", message: "Use fixed settings for this whole-list operation. Field paths select values from incoming items." }];
  if (["action.merge", "action.aggregate", "action.split-out", "action.sort", "action.limit"].includes(type) && Object.keys(config).some((key) => !nodeRules || !Object.hasOwn(nodeRules, key))) return [{ field: "config", message: "Remove unsupported data-node settings." }];
  if (type.startsWith("action.") && Object.hasOwn(config, "executeOnce") && typeof config.executeOnce !== "boolean") {
    issues.push({ field: "executeOnce", message: "Run once must be on or off." });
  }
  if (!nodeRules) return issues;
  for (const [field, rule] of Object.entries(nodeRules)) {
    const selectors = rule.dependsOn ?? ["operation"];
    if (rule.when && phase === "static" && selectors.some((key) => containsExpression(config[key]))) continue;
    if (rule.when && !rule.when(config)) continue;
    if (!Object.hasOwn(config, field)) {
      if (rule.required) issues.push({ field, message: rule.message });
      continue;
    }
    const value = config[field];
    // AI output schemas are literal definitions: their descriptions may contain
    // example braces and must still be validated as schemas.
    if (phase === "static" && field !== "outputSchema" && containsExpression(value)) continue;
    if (!rule.schema.safeParse(value).success) { issues.push({ field, message: rule.message }); continue; }
    const unresolvedDependency = phase === "static" && rule.dependsOn?.some((key) => containsExpression(config[key]));
    if (rule.matches && !unresolvedDependency && !rule.matches(value, config)) issues.push({ field, message: rule.message });
  }
  return issues;
}
