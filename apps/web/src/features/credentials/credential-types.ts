export type CredentialProvider = "GOOGLE" | "STEAM" | "GOOGLE_CHAT_WEBHOOK" | "HTTP" | "DISCORD_WEBHOOK" | "TELEGRAM_BOT" | "GITHUB";

export type CredentialSummary = {
  id: string;
  provider: CredentialProvider;
  label: string;
  isManaged?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type CredentialReferenceDetails = {
  workflows?: Array<{ id: string; name: string; locations?: Array<"draft" | "published"> }>;
  executions?: Array<{ id: string; status?: string; mode?: string; createdAt?: string | Date }>;
};
