import type { OperationCredentialProvider } from "@workflow/contracts";

export type CredentialProvider = OperationCredentialProvider;

export type GmailCapability = "readonly" | "send" | "compose" | "modify" | "labels";

export type CredentialSummary = {
  id: string;
  provider: CredentialProvider;
  label: string;
  isManaged?: boolean;
  gmailCapabilities?: GmailCapability[];
  chatManageEnabled?: boolean;
  googleReconnectRequired?: boolean;
  googleLegacyScopesUnverified?: boolean;
  googleIdentityUnverified?: boolean;
  hints?: Array<{ field: string; label: string; masked: string }>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type CredentialReferenceDetails = {
  workflows?: Array<{ id: string; name: string; locations?: Array<"draft" | "published"> }>;
  executions?: Array<{ id: string; status?: string; mode?: string; createdAt?: string | Date }>;
};
