import { createHash } from "node:crypto";
import type { WorkflowGraph } from "@workflow/contracts";
import { NodeFailure } from "../execution/node-failure";

export type ProviderPollTarget = {
  workflowId: string; versionId: string; workspaceId: string; nodeId: string;
  provider: "notion" | "google-drive" | "google-sheets"; credentialId: string; resourceId: string;
  resourceType: "data-source" | "file" | "folder" | "sheet"; sheetName?: string; keyColumn?: string; event: "created" | "updated";
  pollMinutes: number; configHash: string;
};

export const pollHash = (value: string) => createHash("sha256").update(value).digest("hex");
const notionId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const driveId = /^[A-Za-z0-9_-]{1,256}$/;

export function providerPollTargets(workflowId: string, versionId: string, workspaceId: string, graph: WorkflowGraph): ProviderPollTarget[] {
  return graph.nodes.filter((node) => node.type === "trigger.notion.page" || node.type === "trigger.google-drive.file" || node.type === "trigger.google-sheets.row").map((node) => {
    const provider = node.type === "trigger.notion.page" ? "notion" : node.type === "trigger.google-sheets.row" ? "google-sheets" : "google-drive";
    const credentialId = typeof node.config.credentialId === "string" ? node.config.credentialId : "";
    const resourceId = typeof node.config.resourceId === "string" ? node.config.resourceId.trim() : "";
    const resourceType = provider === "notion" ? "data-source" : provider === "google-sheets" ? "sheet" : node.config.resourceType;
    const event = provider === "google-sheets" ? "created" : node.config.event;
    const sheetName = provider === "google-sheets" && typeof node.config.sheetName === "string" ? node.config.sheetName : "";
    const keyColumn = provider === "google-sheets" && typeof node.config.keyColumn === "string" ? node.config.keyColumn : "";
    const pollMinutes = Number(node.config.pollMinutes ?? 5);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId) || !(provider === "notion" ? notionId : driveId).test(resourceId) || (resourceType !== "data-source" && resourceType !== "file" && resourceType !== "folder" && resourceType !== "sheet") || (event !== "created" && event !== "updated") || ![1, 5, 15, 60].includes(pollMinutes)) throw new NodeFailure("INVALID_INPUT", "Choose a connection, resource, event and polling interval.", false);
    if (provider === "notion" && resourceType !== "data-source" || provider === "google-drive" && resourceType !== "file" && resourceType !== "folder") throw new NodeFailure("INVALID_INPUT", "Choose a supported resource type.", false);
    if (provider === "google-sheets" && (resourceId.length > 200 || !sheetName.trim() || sheetName.length > 100 || /[\x00-\x1f\x7f]/.test(sheetName) || !keyColumn.trim() || keyColumn.length > 256)) throw new NodeFailure("INVALID_INPUT", "Choose a sheet tab and unique key column.", false);
    if (provider === "google-drive" && resourceType === "file" && event === "created") throw new NodeFailure("INVALID_INPUT", "Choose a folder for created files, or updated for an existing file.", false);
    return { workflowId, versionId, workspaceId, nodeId: node.id, provider, credentialId, resourceId, resourceType, event, pollMinutes, ...(provider === "google-sheets" ? { sheetName, keyColumn } : {}), configHash: pollHash(JSON.stringify([provider, credentialId, resourceId, resourceType, event, ...(provider === "google-sheets" ? [sheetName, keyColumn] : [])])) };
  });
}
