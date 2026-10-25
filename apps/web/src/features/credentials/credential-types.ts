export type CredentialProvider = "GOOGLE" | "STEAM" | "GOOGLE_CHAT_WEBHOOK" | "HTTP" | "DISCORD_WEBHOOK" | "TELEGRAM_BOT";

export type CredentialSummary = {
  id: string;
  provider: CredentialProvider;
  label: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type CredentialReferenceDetails = {
  workflows?: Array<{ id: string; name: string }>;
  executions?: Array<{ id: string }>;
};
