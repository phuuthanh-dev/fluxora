import type { NodeConfigurationField } from "./node-configuration-fields";
const project = (): NodeConfigurationField[] => [
  { kind: "credential", key: "credentialId", label: "GitLab connection", providers: ["GITLAB"] },
  { kind: "resource", key: "project", label: "Project", resource: "gitlab-project", credentialKey: "credentialId", placeholder: "Search accessible projects" },
];
const issue = (): NodeConfigurationField => ({ kind: "resource", key: "issue", label: "Issue", resource: "gitlab-issue", credentialKey: "credentialId", dependencyKey: "project", placeholder: "Search issues" });
export const gitlabFields = {
  "action.gitlab.get-project": project,
  "action.gitlab.get-issue": (): NodeConfigurationField[] => [...project(), issue()],
  "action.gitlab.list-issues": (): NodeConfigurationField[] => [...project(), { kind: "select", key: "state", label: "State", fallbackValue: "opened", options: [{ value: "opened", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }] }, { kind: "number", key: "pageSize", label: "Issues per page (1–100)", fallbackValue: 20 }, { kind: "number", key: "page", label: "Page", fallbackValue: 1 }],
  "action.gitlab.create-issue": (): NodeConfigurationField[] => [...project(), { kind: "text", key: "title", label: "Title" }, { kind: "textarea", key: "description", label: "Description (optional)" }],
  "action.gitlab.add-comment": (): NodeConfigurationField[] => [...project(), issue(), { kind: "textarea", key: "body", label: "Comment" }],
  "action.gitlab.update-issue": (): NodeConfigurationField[] => [...project(), issue(), { kind: "text", key: "title", label: "New title" }, { kind: "textarea", key: "description", label: "New description (optional)" }],
  "action.gitlab.get-pipeline": (): NodeConfigurationField[] => [...project(), { kind: "resource", key: "pipeline", label: "Pipeline", resource: "gitlab-pipeline", credentialKey: "credentialId", dependencyKey: "project", placeholder: "Search loaded pipelines" }],
  "action.gitlab.get-merge-request": (): NodeConfigurationField[] => [...project(), { kind: "resource", key: "mergeRequest", label: "Merge request", resource: "gitlab-merge-request", credentialKey: "credentialId", dependencyKey: "project", placeholder: "Search loaded merge requests" }],
  "trigger.gitlab.pipeline": (): NodeConfigurationField[] => [...project(), { kind: "select", key: "status", label: "Pipeline status", fallbackValue: "all", options: [{ value: "all", label: "Any status" }, { value: "success", label: "Succeeded" }, { value: "failed", label: "Failed" }, { value: "canceled", label: "Canceled" }] }],
  "trigger.gitlab.merge-request": (): NodeConfigurationField[] => [...project(), { kind: "select", key: "action", label: "Merge request event", fallbackValue: "open", options: [{ value: "all", label: "Any supported event" }, { value: "open", label: "Opened" }, { value: "update", label: "Updated" }, { value: "merge", label: "Merged" }, { value: "close", label: "Closed" }, { value: "reopen", label: "Reopened" }] }],
};
