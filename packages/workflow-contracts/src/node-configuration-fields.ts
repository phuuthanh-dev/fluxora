import type { OperationCredentialProvider } from "./operation-metadata";

/** Describes inspector controls only. Adapters still validate untrusted input
 * on the server; these descriptors are neither a runtime schema nor auth. */
export type NodeSelectOption = { value: string; label: string };
type NodeFieldVisibilityValue = string | number | boolean;
export type NodeFieldVisibility = { visibleWhen?: { key: string; equals: NodeFieldVisibilityValue | readonly NodeFieldVisibilityValue[]; fallback?: NodeFieldVisibilityValue } };

export type NodeResource = "steam-game" | "github-issue" | "github-pull-request" | "github-repository" | "google-file" | "google-drive-item" | "google-folder" | "google-spreadsheet" | "google-calendar" | "google-calendar-event" | "gmail-label" | "gmail-draft" | "gemini-model" | "openai-model" | "google-chat-space" | "mongodb-database" | "mongodb-collection" | "postgres-schema" | "postgres-table" | "trello-board" | "trello-list" | "trello-card" | "notion-page" | "notion-property" | "notion-data-source" | "notion-source-property" | "notion-source-option" | "sentry-organization" | "sentry-project" | "sentry-installation" | "vercel-team" | "vercel-project" | "supabase-table";

export type NodeConfigurationField =
  | ({ kind: "credential"; key: string; label: string; providers: OperationCredentialProvider[]; optional?: boolean } & NodeFieldVisibility)
  | ({ kind: "boolean"; key: string; label: string; defaultChecked?: boolean } & NodeFieldVisibility)
  | ({ kind: "text" | "textarea"; key: string; label: string; advanced?: { summary: string; help: string } } & NodeFieldVisibility)
  | ({ kind: "datetime"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "number"; key: string; label: string; fallbackValue?: number; advanced?: { summary: string; help: string } } & NodeFieldVisibility)
  | ({ kind: "select"; key: string; label: string; options: NodeSelectOption[]; fallbackValue?: string } & NodeFieldVisibility)
  | ({ kind: "key-value"; key: string; label: string; keyPlaceholder?: string; valuePlaceholder?: string } & NodeFieldVisibility)
  | ({ kind: "table"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "structured-output"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "mongo-filter"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "drive-search"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "row-values"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "resource"; key: string; label: string; resource: NodeResource; credentialKey: string; dependencyKey?: string; secondaryDependencyKey?: string; placeholder?: string } & NodeFieldVisibility);
