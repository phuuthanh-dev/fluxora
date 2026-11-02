import type { NodeConfigurationField } from "./node-configuration-fields";

/** Inspector descriptors, not server validation or GitHub authorization. */
export function githubReadConfigurationFields(kind: "issue" | "pull-request", list: boolean): NodeConfigurationField[] {
  const fields: NodeConfigurationField[] = [
    { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
    { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
  ];
  if (list) fields.push(
    { kind: "select", key: "state", label: "State", options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }] },
    { kind: "number", key: "pageSize", label: "Results per page (1–100)", fallbackValue: 30 },
    { kind: "number", key: "page", label: "Page (1–1,000)", fallbackValue: 1 },
  );
  else fields.push({ kind: "resource", key: kind === "issue" ? "issueNumber" : "pullRequestNumber", label: kind === "issue" ? "Issue number" : "Pull request number", resource: kind === "issue" ? "github-issue" : "github-pull-request", credentialKey: "credentialId", dependencyKey: "repository", placeholder: kind === "issue" ? "Search issues" : "Search pull requests" });
  return fields;
}
