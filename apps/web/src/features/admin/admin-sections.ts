export const adminSections = ["overview", "users", "workspaces", "workflows", "executions", "audit", "privacy", "support"] as const;
export type AdminSection = typeof adminSections[number];
export const adminLabel = (section: string) => section.charAt(0).toUpperCase() + section.slice(1);
