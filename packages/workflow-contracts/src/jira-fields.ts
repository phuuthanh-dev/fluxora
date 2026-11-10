import type { NodeConfigurationField } from "./node-configuration-fields";
const credential = (): NodeConfigurationField => ({ kind: "credential", key: "credentialId", label: "Jira connection", providers: ["JIRA"] });
const project = (): NodeConfigurationField => ({ kind: "resource", key: "project", label: "Project", resource: "jira-project", credentialKey: "credentialId", placeholder: "Select a project" });
const issue = (): NodeConfigurationField => ({ kind: "resource", key: "issue", label: "Issue", resource: "jira-issue", credentialKey: "credentialId", placeholder: "Search issue key or title" });
export const jiraFields = {
  "trigger.jira.issue": (): NodeConfigurationField[] => [credential(), project(), { kind: "select", key: "event", label: "Issue event", fallbackValue: "jira:issue_created", options: [{ value: "jira:issue_created", label: "Created" }, { value: "jira:issue_updated", label: "Updated" }, { value: "jira:issue_deleted", label: "Deleted" }] }],
  "action.jira.search-issues": (): NodeConfigurationField[] => [credential(), { kind: "textarea", key: "query", label: "JQL query (optional)" }, { kind: "number", key: "limit", label: "Maximum issues (1–100)", fallbackValue: 25 }, { kind: "text", key: "cursor", label: "Next cursor (optional)", advanced: { summary: "Advanced pagination", help: "Reuse nextCursor with the same connection and JQL query." } }],
  "action.jira.create-issue": (): NodeConfigurationField[] => [credential(), project(), { kind: "resource", key: "issueType", label: "Issue type", resource: "jira-issue-type", credentialKey: "credentialId", dependencyKey: "project", placeholder: "Select an issue type" }, { kind: "text", key: "summary", label: "Summary" }, { kind: "textarea", key: "description", label: "Description (optional)" }],
  "action.jira.get-issue": (): NodeConfigurationField[] => [credential(), issue()],
  "action.jira.update-issue": (): NodeConfigurationField[] => [credential(), issue(), { kind: "text", key: "summary", label: "New summary" }],
  "action.jira.add-comment": (): NodeConfigurationField[] => [credential(), issue(), { kind: "textarea", key: "comment", label: "Comment" }],
};
