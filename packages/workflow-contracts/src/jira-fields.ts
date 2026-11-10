import type { NodeConfigurationField } from "./node-configuration-fields";
const credential = (): NodeConfigurationField => ({ kind: "credential", key: "credentialId", label: "Jira connection", providers: ["JIRA"] });
const project = (): NodeConfigurationField => ({ kind: "resource", key: "project", label: "Project", resource: "jira-project", credentialKey: "credentialId", placeholder: "Select a project" });
const issue = (): NodeConfigurationField => ({ kind: "text", key: "issue", label: "Issue key" });
export const jiraFields = {
  "action.jira.create-issue": (): NodeConfigurationField[] => [credential(), project(), { kind: "resource", key: "issueType", label: "Issue type", resource: "jira-issue-type", credentialKey: "credentialId", dependencyKey: "project", placeholder: "Select an issue type" }, { kind: "text", key: "summary", label: "Summary" }, { kind: "textarea", key: "description", label: "Description (optional)" }],
  "action.jira.get-issue": (): NodeConfigurationField[] => [credential(), issue()],
  "action.jira.update-issue": (): NodeConfigurationField[] => [credential(), issue(), { kind: "text", key: "summary", label: "New summary" }],
  "action.jira.add-comment": (): NodeConfigurationField[] => [credential(), issue(), { kind: "textarea", key: "comment", label: "Comment" }],
};
