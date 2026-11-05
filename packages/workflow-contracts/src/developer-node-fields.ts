import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";

/** Inspector descriptors only; backend validation remains authoritative. */
export const developerNodeFields = {
  "trigger.sentry.issue-created": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Sentry connection (for discovery)", providers: ["SENTRY"], optional: true },
      { kind: "resource", key: "organization", label: "Organization", resource: "sentry-organization", credentialKey: "credentialId", placeholder: "Search organizations" },
      { kind: "resource", key: "project", label: "Project", resource: "sentry-project", credentialKey: "credentialId", dependencyKey: "organization", placeholder: "Search projects" },
      { kind: "resource", key: "installationId", label: "Custom integration installation", resource: "sentry-installation", credentialKey: "credentialId", dependencyKey: "organization", placeholder: "Search installations" },
    ],
  "trigger.trello.board-action": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Trello connection (for discovery)", providers: ["TRELLO"], optional: true },
      { kind: "resource", key: "boardId", label: "Board", resource: "trello-board", credentialKey: "credentialId", placeholder: "Search boards" },
      { kind: "select", key: "action", label: "Event", options: [{ value: "all", label: "All board actions" }, { value: "createCard", label: "Card created" }, { value: "updateCard", label: "Card updated" }, { value: "commentCard", label: "Comment added" }, { value: "deleteCard", label: "Card deleted" }] },
    ],
  "trigger.vercel.deployment": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Vercel connection (for discovery)", providers: ["VERCEL"], optional: true },
      { kind: "resource", key: "team", label: "Account or team", resource: "vercel-team", credentialKey: "credentialId", placeholder: "Search teams" },
      { kind: "resource", key: "project", label: "Project", resource: "vercel-project", credentialKey: "credentialId", dependencyKey: "team", placeholder: "Search projects" },
      { kind: "select", key: "event", label: "Event", options: [{ value: "deployment.created", label: "Deployment created" }, { value: "deployment.succeeded", label: "Deployment succeeded (after checks)" }, { value: "deployment.error", label: "Deployment failed" }, { value: "deployment.canceled", label: "Deployment canceled" }, { value: "deployment.ready", label: "Deployment ready (integration checks)" }] },
    ],
  "trigger.uptime-kuma.alert": (): NodeConfigurationField[] => [
      { kind: "text", key: "monitorId", label: "Monitor ID (optional)" },
      { kind: "select", key: "statusFilter", label: "Alert status", fallbackValue: "any", options: [{ value: "any", label: "All statuses" }, { value: "0", label: "Down" }, { value: "1", label: "Up" }, { value: "2", label: "Pending" }, { value: "3", label: "Maintenance" }] },
    ],
  "trigger.github.issue-opened": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  "trigger.github.pull-request-opened": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  "trigger.github.push": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  "trigger.github.workflow-run-completed": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  "action.trello.create-card": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Trello connection", providers: ["TRELLO"] },
      { kind: "resource", key: "boardId", label: "Board", resource: "trello-board", credentialKey: "credentialId", placeholder: "Search boards" },
      { kind: "resource", key: "listId", label: "List", resource: "trello-list", credentialKey: "credentialId", dependencyKey: "boardId", placeholder: "Search lists" },
      { kind: "text", key: "title", label: "Card title" },
      { kind: "textarea", key: "description", label: "Description (optional)" },
    ],
  "action.sentry.list-issues": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Sentry connection", providers: ["SENTRY"] },
      { kind: "resource", key: "organization", label: "Organization", resource: "sentry-organization", credentialKey: "credentialId", placeholder: "Search organizations" },
      { kind: "resource", key: "project", label: "Project", resource: "sentry-project", credentialKey: "credentialId", dependencyKey: "organization", placeholder: "Search projects" },
      { kind: "select", key: "status", label: "Issue status", options: [{ value: "unresolved", label: "Unresolved" }, { value: "resolved", label: "Resolved" }, { value: "all", label: "All" }] },
      { kind: "number", key: "limit", label: "Maximum issues (1–100)", fallbackValue: 20 },
      { kind: "text", key: "cursor", label: "Continuation cursor", advanced: { summary: "Continue a previous page", help: "Use the previous nextCursor with the same organization, project and status. Continuation can be unknown." } },
    ],
  "action.vercel.list-deployments": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Vercel connection", providers: ["VERCEL"] },
      { kind: "resource", key: "team", label: "Account or team", resource: "vercel-team", credentialKey: "credentialId", placeholder: "Search teams" },
      { kind: "resource", key: "project", label: "Project", resource: "vercel-project", credentialKey: "credentialId", dependencyKey: "team", placeholder: "Search projects" },
      { kind: "number", key: "limit", label: "Maximum deployments (1–100)", fallbackValue: 20 },
      { kind: "text", key: "cursor", label: "Continuation cursor", advanced: { summary: "Continue a previous page", help: "Use the previous nextCursor with the same account and project. Continuation can be unknown." } },
    ],
  "action.sentry.get-issue": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Sentry connection", providers: ["SENTRY"] },
      { kind: "resource", key: "organization", label: "Organization", resource: "sentry-organization", credentialKey: "credentialId", placeholder: "Search organizations" },
      { kind: "resource", key: "project", label: "Project", resource: "sentry-project", credentialKey: "credentialId", dependencyKey: "organization", placeholder: "Search projects" },
      { kind: "text", key: "issueId", label: "Numeric issue ID" },
    ],
  "action.vercel.public-deployment-lookup": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Vercel connection", providers: ["VERCEL"] },
      { kind: "resource", key: "team", label: "Account or team", resource: "vercel-team", credentialKey: "credentialId", placeholder: "Search teams" },
      { kind: "text", key: "deploymentId", label: "Deployment ID" },
    ],
  "action.reddit.list-posts": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Reddit connection", providers: ["REDDIT"] },
      { kind: "text", key: "subreddit", label: "Public community (e.g. technology)" },
      { kind: "select", key: "sort", label: "Sort posts", options: [{ value: "new", label: "Newest" }, { value: "hot", label: "Popular" }] },
      { kind: "number", key: "limit", label: "Maximum posts (1–100)", fallbackValue: 20 },
    ],
  "action.github": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "text", key: "title", label: "Issue title" },
      { kind: "textarea", key: "body", label: "Issue body" },
      { kind: "text", key: "labels", label: "Labels (comma-separated, optional)" },
      { kind: "text", key: "idempotencyKey", label: "Idempotency key (optional)" },
    ],
  "action.github.add-label": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "resource", key: "issueNumber", label: "Issue number", resource: "github-issue", credentialKey: "credentialId", dependencyKey: "repository", placeholder: "Search issues" },
      { kind: "text", key: "label", label: "Label" },
    ],
  "action.github.add-comment": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "resource", key: "issueNumber", label: "Issue number", resource: "github-issue", credentialKey: "credentialId", dependencyKey: "repository", placeholder: "Search issues" },
      { kind: "textarea", key: "body", label: "Comment" },
    ],
  "action.github.merge-pull-request": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "resource", key: "pullRequestNumber", label: "Pull request number", resource: "github-pull-request", credentialKey: "credentialId", dependencyKey: "repository", placeholder: "Search pull requests" },
      { kind: "text", key: "expectedHeadSha", label: "Expected head commit SHA (optional)" },
      { kind: "select", key: "mergeMethod", label: "Merge method", options: [
        { value: "merge", label: "Merge commit" },
        { value: "squash", label: "Squash and merge" },
        { value: "rebase", label: "Rebase and merge" },
      ] },
    ],
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;
