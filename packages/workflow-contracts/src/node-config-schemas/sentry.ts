import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

export const isSentryCursor = (value: unknown): value is string => typeof value === "string" && /^-?[0-9]{1,20}:[0-9]{1,20}:[01]$/.test(value);
const slug: FieldRule = { schema: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/i), required: true, message: "Choose a valid Sentry resource." };
const resource = { organization: slug, project: slug };
export const sentryListIssues: ConfigRules = {
  ...resource,
  status: { schema: z.enum(["unresolved", "resolved", "all"]), message: "Choose a valid issue status." },
  limit: { schema: z.number().int().min(1).max(100), message: "Choose a limit between 1 and 100." },
  cursor: { schema: z.string().refine((value) => value === "" || isSentryCursor(value)), message: "Enter a valid cursor for Sentry." },
};
export const sentryGetIssue: ConfigRules = {
  ...resource,
  issueId: { schema: z.string().regex(/^[0-9]{1,100}$/), required: true, message: "Enter a numeric Sentry issue ID." },
};
