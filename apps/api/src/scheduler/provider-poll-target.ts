import { createHash } from "node:crypto";
import type { WorkflowGraph } from "@workflow/contracts";
import { NodeFailure } from "../execution/node-failure";

export type ProviderPollTarget = {
  workflowId: string; versionId: string; workspaceId: string; nodeId: string;
  provider: "notion" | "google-drive"; credentialId: string; resourceId: string;
  resourceType: "data-source" | "file" | "folder"; event: "created" | "updated";
  pollMinutes: number; configHash: string;
};

export const pollHash = (value: string) => createHash("sha256").update(value).digest("hex");
const notionId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const driveId = /^[A-Za-z0-9_-]{1,256}$/;

export function providerPollTargets(workflowId: string, versionId: string, workspaceId: string, graph: WorkflowGraph): ProviderPollTarget[] {
  return graph.nodes.filter((node) => node.type === "trigger.notion.page" || node.type === "trigger.google-drive.file").map((node) => {
    const provider = node.type === "trigger.notion.page" ? "notion" : "google-drive";
    const credentialId = typeof node.config.credentialId === "string" ? node.config.credentialId : "";
    const resourceId = typeof node.config.resourceId === "string" ? node.config.resourceId.trim() : "";
    const resourceType = provider === "notion" ? "data-source" : node.config.resourceType;
    const event = node.config.event;
    const pollMinutes = Number(node.config.pollMinutes ?? 5);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId) || !(provider === "notion" ? notionId : driveId).test(resourceId) || (resourceType !== "data-source" && resourceType !== "file" && resourceType !== "folder") || (event !== "created" && event !== "updated") || ![1, 5, 15, 60].includes(pollMinutes)) throw new NodeFailure("INVALID_INPUT", "Choose a connection, resource, event and polling interval.", false);
    if (provider === "notion" && resourceType !== "data-source" || provider === "google-drive" && resourceType === "data-source") throw new NodeFailure("INVALID_INPUT", "Choose a supported resource type.", false);
    if (provider === "google-drive" && resourceType === "file" && event === "created") throw new NodeFailure("INVALID_INPUT", "Choose a folder for created files, or updated for an existing file.", false);
    return { workflowId, versionId, workspaceId, nodeId: node.id, provider, credentialId, resourceId, resourceType, event, pollMinutes, configHash: pollHash(JSON.stringify([provider, credentialId, resourceId, resourceType, event])) };
  });
}
