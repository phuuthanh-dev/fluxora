import { createHash } from "node:crypto";
import type { CredentialService } from "../credentials/credential.service";
import { gmailOperations, type GmailMessageInput } from "./gmail-operations";
import { NodeFailure } from "./node-failure";

type Operation = "send" | "reply" | "draft" | "updateDraft" | "label";
const invalid = () => new NodeFailure("INVALID_INPUT", "Check the Gmail fields and try again.", false);
function addresses(value: unknown, required: boolean): string[] {
  if ((value === undefined || value === "") && !required) return [];
  const values = typeof value === "string" ? value.split(",").map((item) => item.trim()) : value;
  if (!Array.isArray(values) || !values.length || values.some((item) => typeof item !== "string" || !item)) throw invalid();
  return values as string[];
}
function input(config: Record<string, unknown>, operation: Operation): GmailMessageInput {
  if (typeof config.text !== "string" || (operation !== "reply" && typeof config.subject !== "string")) throw invalid();
  return { to: addresses(config.to, true), cc: addresses(config.cc, false), bcc: addresses(config.bcc, false), subject: operation === "reply" ? "" : config.subject as string, text: config.text };
}

/** Writes use only the selected Gmail credential and never replay ambiguous provider outcomes. */
export async function executeGmailWrite(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService) {
  if (!["send", "reply", "draft", "updateDraft", "label"].includes(operation)) throw invalid();
  const messageId = typeof config.messageId === "string" ? config.messageId.trim() : "";
  const draftId = typeof config.draftId === "string" ? config.draftId.trim() : "";
  const labelId = typeof config.labelId === "string" ? config.labelId.trim() : "";
  const labelAction = config.labelAction;
  if ((operation === "reply" || operation === "label") && !/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) throw invalid();
  if (operation === "updateDraft" && !/^[A-Za-z0-9_-]{1,128}$/.test(draftId)) throw invalid();
  if (operation === "label" && (!/^[A-Za-z0-9_-]{1,128}$/.test(labelId) || (labelAction !== "add" && labelAction !== "remove"))) throw invalid();
  const message = operation === "label" ? undefined : input(config, operation);
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (mode === "live" && !credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Gmail connection.", false);
  const syntheticToken = "fluxora-synthetic-token";
  const mockCredentials = { readGoogleForExecution: async () => ({ accessToken: syntheticToken, grantedScopes: ["https://www.googleapis.com/auth/gmail.modify"], scopeTokenHash: createHash("sha256").update(syntheticToken).digest("hex") }) };
  const client = gmailOperations(mode === "mock" ? {
    workspaceId: "mock", credentialId: "mock", credentials: mockCredentials as never,
    transport: async (url, init) => {
      if (init.method === "GET") return Response.json({ id: messageId, threadId: "mock-thread", payload: { headers: [{ name: "Message-ID", value: "<mock@example.test>" }, { name: "Subject", value: "Example subject" }] } });
      if (url.endsWith("/drafts") || init.method === "PUT") return Response.json({ id: init.method === "PUT" ? draftId : "mock-draft", message: { id: "mock-message", threadId: "mock-thread" } });
      if (url.endsWith("/modify")) return Response.json({ id: messageId, labelIds: labelAction === "add" ? [labelId] : [] });
      return Response.json({ id: "mock-message", threadId: "mock-thread" });
    },
  } : { workspaceId, credentialId, credentials });
  const result = operation === "label" ? await client.modifyMessage(messageId, labelAction === "add" ? { addLabelIds: [labelId] } : { removeLabelIds: [labelId] })
    : operation === "draft" ? await client.createDraft(message!)
    : operation === "updateDraft" ? await client.updateDraft(draftId, message!)
    : operation === "reply" ? await client.reply(messageId, message!) : await client.sendMessage(message!);
  return { status: "succeeded" as const, output: { result, ...(mode === "mock" ? { simulated: true } : {}) }, route: "success" as const };
}
