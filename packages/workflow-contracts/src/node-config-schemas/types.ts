import type { ZodType } from "zod";

export type NodeConfigIssue = { field: string; message: string };
export type FieldRule = { schema: ZodType; message: string; required?: boolean; when?: (config: Record<string, unknown>) => boolean; dependsOn?: readonly string[]; matches?: (value: unknown, config: Record<string, unknown>) => boolean };
export type ConfigRules = Readonly<Record<string, FieldRule>>;
