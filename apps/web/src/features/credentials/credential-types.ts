export type CredentialProvider = "GOOGLE" | "STEAM" | "GOOGLE_CHAT_WEBHOOK" | "HTTP" | "DISCORD_WEBHOOK" | "TELEGRAM_BOT";

export type CredentialSummary = {
  id: string;
  provider: CredentialProvider;
  label: string;
};
