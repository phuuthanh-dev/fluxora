import type { OperationCredentialProvider } from "./operation-metadata";

/** Describes inspector controls only. Adapters still validate untrusted input
 * on the server; these descriptors are neither a runtime schema nor auth. */
export type NodeSelectOption = { value: string; label: string };
type NodeFieldVisibilityValue = string | number | boolean;
export type NodeFieldVisibility = { visibleWhen?: { key: string; equals: NodeFieldVisibilityValue | readonly NodeFieldVisibilityValue[]; fallback?: NodeFieldVisibilityValue } };

export type NodeResource = "github-issue" | "github-pull-request" | "github-repository" | "google-file" | "google-spreadsheet" | "google-calendar" | "google-calendar-event" | "gmail-label" | "gmail-draft" | "gemini-model" | "openai-model" | "google-chat-space" | "mongodb-database" | "mongodb-collection" | "postgres-schema" | "postgres-table" | "trello-board" | "trello-list" | "trello-card" | "notion-page" | "sentry-organization" | "sentry-project" | "sentry-installation" | "vercel-team" | "vercel-project" | "supabase-table";

export type NodeConfigurationField =
  | ({ kind: "credential"; key: string; label: string; providers: OperationCredentialProvider[]; optional?: boolean } & NodeFieldVisibility)
  | ({ kind: "boolean"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "text" | "textarea"; key: string; label: string; advanced?: { summary: string; help: string } } & NodeFieldVisibility)
  | ({ kind: "datetime"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "number"; key: string; label: string; fallbackValue: number } & NodeFieldVisibility)
  | ({ kind: "select"; key: string; label: string; options: NodeSelectOption[] } & NodeFieldVisibility)
  | ({ kind: "key-value"; key: string; label: string; keyPlaceholder?: string; valuePlaceholder?: string } & NodeFieldVisibility)
  | ({ kind: "table"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "structured-output"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "mongo-filter"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "resource"; key: string; label: string; resource: NodeResource; credentialKey: string; dependencyKey?: string; placeholder?: string } & NodeFieldVisibility);
