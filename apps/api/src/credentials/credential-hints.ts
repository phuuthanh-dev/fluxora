import { CredentialProvider } from "@prisma/client";

// Only allowlisted, long opaque-looking API tokens are eligible. Never derive hints from
// passwords, OAuth credentials, connection strings, or webhook URLs.
const hintFields: Partial<Record<CredentialProvider, ReadonlyArray<{ key: string; label: string }>>> = {
  [CredentialProvider.TRELLO]: [{ key: "apiKey", label: "API key" }, { key: "token", label: "Token" }],
  [CredentialProvider.GITHUB]: [{ key: "token", label: "Token" }],
  [CredentialProvider.SENTRY]: [{ key: "token", label: "Token" }],
  [CredentialProvider.VERCEL]: [{ key: "token", label: "Token" }],
  [CredentialProvider.NOTION]: [{ key: "token", label: "Token" }],
  [CredentialProvider.STEAM]: [{ key: "apiKey", label: "API key" }],
  [CredentialProvider.GEMINI]: [{ key: "apiKey", label: "API key" }],
  [CredentialProvider.OPENAI]: [{ key: "apiKey", label: "API key" }],
  [CredentialProvider.SUPABASE]: [{ key: "apiKey", label: "API key" }],
  [CredentialProvider.REDDIT]: [{ key: "clientSecret", label: "Client secret" }],
};

export function credentialHints(provider: CredentialProvider, data: Record<string, unknown>) {
  return (hintFields[provider] ?? []).flatMap(({ key, label }) => {
    const value = data[key];
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{24,4096}$/.test(value)) return [];
    return [{ field: key, label, masked: `••••••${value.slice(-2)}` }];
  });
}
