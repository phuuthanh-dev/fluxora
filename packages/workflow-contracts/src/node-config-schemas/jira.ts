import { z } from "zod";
import type { ConfigRules } from "./types";
const id = { schema: z.string().regex(/^\d{1,20}$/), required: true, message: "Choose a valid Jira resource." };
const issue = { schema: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/), required: true, message: "Enter an issue key like PROJECT-123." };
const summary = { schema: z.string().trim().min(1).max(255), required: true, message: "Enter a summary of at most 255 characters." };
export const jiraCreate: ConfigRules = { project: id, issueType: id, summary, description: { schema: z.string().max(10000), message: "Description is limited to 10,000 characters." } };
export const jiraGet: ConfigRules = { issue };
export const jiraUpdate: ConfigRules = { issue, summary };
export const jiraComment: ConfigRules = { issue, comment: { schema: z.string().trim().min(1).max(10000), required: true, message: "Enter a comment of at most 10,000 characters." } };
