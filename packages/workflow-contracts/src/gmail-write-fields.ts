import type { NodeConfigurationField } from "./node-configuration-fields";

export type GmailWriteOperation = "send" | "reply" | "draft" | "updateDraft" | "label";

/** Inspector descriptors; the Gmail adapter owns validation and authorization. */
export function gmailWriteConfigurationFields(operation: GmailWriteOperation): NodeConfigurationField[] {
  const fields: NodeConfigurationField[] = [{ kind: "credential", key: "credentialId", label: "Gmail connection", providers: ["GMAIL"] }];
  if (operation === "reply" || operation === "label") fields.push({ kind: "text", key: "messageId", label: "Message ID or expression" });
  if (operation === "updateDraft") fields.push({ kind: "resource", key: "draftId", label: "Draft", resource: "gmail-draft", credentialKey: "credentialId", placeholder: "Search drafts" });
  if (operation === "label") fields.push(
    { kind: "resource", key: "labelId", label: "Label", resource: "gmail-label", credentialKey: "credentialId", placeholder: "Search labels" },
    { kind: "select", key: "labelAction", label: "Action", options: [{ value: "add", label: "Add label" }, { value: "remove", label: "Remove label" }] },
  );
  else {
    fields.push({ kind: "text", key: "to", label: "To (comma-separated)" }, { kind: "text", key: "cc", label: "Cc (optional)" }, { kind: "text", key: "bcc", label: "Bcc (optional)" });
    if (operation !== "reply") fields.push({ kind: "text", key: "subject", label: "Subject" });
    fields.push({ kind: "textarea", key: "text", label: "Message text" });
  }
  return fields;
}
