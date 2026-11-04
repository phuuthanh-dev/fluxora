import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";

/** Inspector descriptors only; backend validation remains authoritative. */
export const dataNodeFields = {
  "action.steam": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Steam connection", providers: ["STEAM"] },
      { kind: "select", key: "operation", label: "Operation", options: [
        { value: "profile", label: "Get user profile" },
        { value: "friends", label: "Get friend list" },
        { value: "badges", label: "Get badges" },
        { value: "resolveVanity", label: "Resolve profile URL" },
        { value: "ownedGames", label: "Get owned games" },
        { value: "recentGames", label: "Get recently played games" },
        { value: "achievements", label: "Get game achievements" },
      ] },
      { kind: "text", key: "steamId", label: "Steam ID 64 (optional: use connection)", visibleWhen: { key: "operation", equals: ["profile", "friends", "badges", "ownedGames", "recentGames", "achievements"], fallback: "profile" } },
      { kind: "boolean", key: "includePlayedFreeGames", label: "Include played free games", defaultChecked: false, visibleWhen: { key: "operation", equals: "ownedGames" } },
      { kind: "text", key: "vanity", label: "Profile name or Steam profile URL", visibleWhen: { key: "operation", equals: "resolveVanity" } },
      { kind: "resource", key: "appId", label: "Game", resource: "steam-game", credentialKey: "credentialId", dependencyKey: "steamId", placeholder: "Search owned games", visibleWhen: { key: "operation", equals: "achievements" } },
      { kind: "text", key: "language", label: "Achievement language (optional)", visibleWhen: { key: "operation", equals: "achievements" } },
    ],
  "action.steam.account-snapshot": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Steam credential", providers: ["STEAM"] },
      { kind: "text", key: "steamId", label: "Steam ID 64" },
      { kind: "boolean", key: "includeOwnedGames", label: "Include owned games and playtime" },
      { kind: "boolean", key: "includeRecentGames", label: "Include recently played games" },
      { kind: "text", key: "achievementAppId", label: "Achievement app ID (optional)" },
    ],
  "trigger.rss.new-item": (): NodeConfigurationField[] => [
      { kind: "text", key: "url", label: "Public feed URL" },
      { kind: "select", key: "pollMinutes", label: "Check for new items", options: [{ value: "1", label: "Every minute" }, { value: "5", label: "Every 5 minutes" }, { value: "15", label: "Every 15 minutes" }, { value: "60", label: "Every hour" }] },
    ],
  "action.postgres.select": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "PostgreSQL credential", providers: ["POSTGRES"] },
      { kind: "resource", key: "schema", label: "Schema", resource: "postgres-schema", credentialKey: "credentialId", placeholder: "Search schemas" },
      { kind: "resource", key: "table", label: "Table", resource: "postgres-table", credentialKey: "credentialId", dependencyKey: "schema", placeholder: "Search tables" },
      { kind: "number", key: "limit", label: "Maximum rows (1–100)", fallbackValue: 20 },
    ],
  "action.postgres.select.v2": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "PostgreSQL credential", providers: ["POSTGRES"] },
      { kind: "resource", key: "schema", label: "Schema", resource: "postgres-schema", credentialKey: "credentialId", placeholder: "Search schemas" },
      { kind: "resource", key: "table", label: "Table", resource: "postgres-table", credentialKey: "credentialId", dependencyKey: "schema", placeholder: "Search tables" },
      { kind: "number", key: "limit", label: "Maximum rows (1–100)", fallbackValue: 20 },
    ],
  "action.rss.read": (): NodeConfigurationField[] => [
      { kind: "text", key: "url", label: "Public feed URL (no secrets)" },
      { kind: "number", key: "limit", label: "Maximum items (1–100)", fallbackValue: 20 },
    ],
  "action.supabase.select": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Supabase connection", providers: ["SUPABASE"] },
      { kind: "resource", key: "table", label: "Table", resource: "supabase-table", credentialKey: "credentialId", placeholder: "Search tables" },
      { kind: "number", key: "limit", label: "Maximum rows (1–100)", fallbackValue: 20 },
    ],
  "action.supabase.select.v2": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Supabase connection", providers: ["SUPABASE"] },
      { kind: "resource", key: "table", label: "Table", resource: "supabase-table", credentialKey: "credentialId", placeholder: "Search tables" },
      { kind: "number", key: "limit", label: "Maximum rows (1–100)", fallbackValue: 20 },
    ],
  "action.notion.search-pages": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Notion credential", providers: ["NOTION"] },
      { kind: "text", key: "query", label: "Page title contains (optional)" },
      { kind: "number", key: "pageSize", label: "Maximum pages (1–100)", fallbackValue: 20 },
    ],
  "action.notion.search-pages.v2": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "Notion credential", providers: ["NOTION"] },
      { kind: "text", key: "query", label: "Page title contains (optional)" },
      { kind: "number", key: "pageSize", label: "Maximum pages (1–100)", fallbackValue: 20 },
      { kind: "text", key: "cursor", label: "Next cursor (optional)", advanced: { summary: "Advanced pagination", help: "Use nextCursor from the previous Notion search output to continue with the same search." } },
    ],
  "action.mongodb": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "MongoDB credential", providers: ["MONGODB"] },
      { kind: "resource", key: "database", label: "Database", resource: "mongodb-database", credentialKey: "credentialId", placeholder: "Search databases" },
      { kind: "resource", key: "collection", label: "Collection", resource: "mongodb-collection", credentialKey: "credentialId", dependencyKey: "database", placeholder: "Search collections" },
      { kind: "mongo-filter", key: "filter", label: "Filter documents" },
      { kind: "number", key: "limit", label: "Maximum documents (1–100)", fallbackValue: 20 },
    ],
  "action.mongodb.insert": (): NodeConfigurationField[] => [
      { kind: "credential", key: "credentialId", label: "MongoDB credential", providers: ["MONGODB"] },
      { kind: "resource", key: "database", label: "Database", resource: "mongodb-database", credentialKey: "credentialId", placeholder: "Search databases" },
      { kind: "resource", key: "collection", label: "Collection", resource: "mongodb-collection", credentialKey: "credentialId", dependencyKey: "database", placeholder: "Search collections" },
      { kind: "textarea", key: "document", label: "Document (JSON)" },
    ],
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;
