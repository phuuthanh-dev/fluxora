import type { CredentialService } from "../credentials/credential.service";
import { nodeConfigIssues } from "@workflow/contracts";
import { NodeFailure } from "./node-failure";
import { gmailOperations } from "./gmail-operations";

export async function executeGmailGetMessage(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService) {
  const issue = nodeConfigIssues("action.gmail.get-message", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const messageId = typeof config.messageId === "string" ? config.messageId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) throw new NodeFailure("INVALID_INPUT", "Enter a Gmail message ID.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { message: { id: messageId, threadId: "example-thread", from: "sender@example.test", to: "owner@example.test", subject: "Example message", date: "", snippet: "Example", text: "Synthetic message", bodyStatus: "available", bodyCharset: "utf-8", bodyPartial: false, attachmentsPresent: false, attachmentBacked: false, labels: ["INBOX"] } }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Gmail connection.", false);
  const message = await gmailOperations({ workspaceId, credentialId, credentials }).getMessage(messageId);
  return { status: "succeeded" as const, output: { message }, route: "success" as const };
}
