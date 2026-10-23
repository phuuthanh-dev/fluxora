export type CredentialProvider = "GOOGLE" | "STEAM" | "GOOGLE_CHAT_WEBHOOK" | "HTTP";

export type CredentialSummary = {
  id: string;
  provider: CredentialProvider;
  label: string;
};
