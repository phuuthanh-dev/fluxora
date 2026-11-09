import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";

/** Inspector descriptors only; backend validation remains authoritative. */
export const communicationNodeFields = {
  "trigger.telegram.update": (): NodeConfigurationField[] => [
      { kind: "select", key: "event", label: "Event", options: [{ value: "message", label: "Message" }, { value: "channel_post", label: "Channel post" }, { value: "callback_query", label: "Button callback" }, { value: "all", label: "All supported updates" }] },
      { kind: "select", key: "chatMode", label: "Allowed chats", options: [{ value: "allowlist", label: "Only listed chat IDs" }, { value: "all", label: "All chats that reach this bot" }] },
      { kind: "text", key: "allowedChatIds", label: "Allowed chat IDs (comma-separated)", visibleWhen: { key: "chatMode", equals: "allowlist" } },
    ],
  "action.google-chat.webhook": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Google Chat credential", providers: ["GOOGLE_CHAT_WEBHOOK"] },
      { kind: "textarea", key: "message", label: "Message template" },
    ],
  "action.slack.webhook": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Slack connection", providers: ["SLACK_WEBHOOK"] },
      { kind: "textarea", key: "message", label: "Message" },
    ],
  "action.discord.webhook": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Discord credential", providers: ["DISCORD_WEBHOOK"] },
      { kind: "textarea", key: "content", label: "Message content" },
      { kind: "text", key: "username", label: "Username (optional)" },
      { kind: "text", key: "avatarUrl", label: "Avatar URL (optional)" },
      { kind: "textarea", key: "embeds", label: "Embeds JSON (optional)" },
      { kind: "textarea", key: "allowedMentions", label: "Allowed mentions JSON (optional)" },
    ],
  "action.email": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "SMTP credential", providers: ["SMTP"] },
      { kind: "text", key: "to", label: "To (comma-separated)" },
      { kind: "text", key: "cc", label: "Cc (optional, comma-separated)" },
      { kind: "text", key: "bcc", label: "Bcc (optional, comma-separated)" },
      { kind: "text", key: "subject", label: "Subject" },
      { kind: "select", key: "bodyFormat", label: "Body format", options: [
        { value: "text", label: "Plain text" },
        { value: "html", label: "HTML" },
      ] },
      { kind: "textarea", key: "body", label: "Message" },
      { kind: "text", key: "replyTo", label: "Reply-to (optional)" },
    ],
  "action.google-chat.oauth": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Google Chat credential", providers: ["GOOGLE_CHAT_OAUTH"] },
      { kind: "resource", key: "space", label: "Space", resource: "google-chat-space", credentialKey: "credentialId", placeholder: "Search spaces" },
      { kind: "textarea", key: "message", label: "Message template" },
    ],
  "action.google-chat.reply": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Google Chat credential", providers: ["GOOGLE_CHAT_OAUTH"] },
      { kind: "resource", key: "space", label: "Space", resource: "google-chat-space", credentialKey: "credentialId", placeholder: "Search spaces" },
      { kind: "text", key: "threadName", label: "Thread resource name" },
      { kind: "textarea", key: "message", label: "Message template" },
    ],
  "action.google-chat.edit-message": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Google Chat credential", providers: ["GOOGLE_CHAT_OAUTH"] },
      { kind: "resource", key: "space", label: "Space", resource: "google-chat-space", credentialKey: "credentialId", placeholder: "Search spaces" },
      { kind: "text", key: "messageName", label: "Message resource name or expression" },
      { kind: "textarea", key: "message", label: "New message text" },
    ],
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;
