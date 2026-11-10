import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

const repository: FieldRule = {
  schema: z.string().refine((value) => {
    const parts = value.trim().split("/");
    return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== "." && part !== "..");
  }),
  required: true,
  message: "GitHub repository must use the owner/repository format.",
};
const integer = (maximum: number) => z.union([z.number(), z.string()]).refine((value) => {
  const text = String(value).trim();
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) <= maximum;
});
const numberRule = (label: string): FieldRule => ({ schema: integer(Number.MAX_SAFE_INTEGER), required: true, message: `Enter a valid GitHub ${label} number.` });
const issueNumber = numberRule("issue");
const pullRequestNumber = numberRule("pull request");
const optionalText = z.union([z.string(), z.null()]);
const list: ConfigRules = {
  repository,
  page: { schema: integer(1000), message: "GitHub page must be between 1 and 1000." },
  pageSize: { schema: integer(100), message: "GitHub page size must be between 1 and 100." },
  state: { schema: z.enum(["open", "closed", "all"]), message: "Choose a valid GitHub state." },
};
export const githubList = list;
export const githubGetIssue: ConfigRules = { repository, issueNumber };
export const githubGetPullRequest: ConfigRules = { repository, pullRequestNumber };
export const githubCreateIssue: ConfigRules = {
  repository,
  title: { schema: z.string().refine((value) => value.trim().length > 0), required: true, message: "GitHub issue title is required." },
  body: { schema: z.string(), message: "GitHub issue body must be text." },
  labels: { schema: z.union([optionalText, z.array(z.string().trim().min(1).max(50).refine((v) => !/[\u0000-\u001f\u007f]/.test(v))).max(20)]), message: "Choose up to 20 labels or enter comma-separated text." },
  idempotencyKey: { schema: optionalText.refine((value) => value === null || value === "" || /^[\x21-\x7e]{1,160}$/.test(value.trim())), message: "GitHub idempotency key must be visible ASCII text up to 160 characters." },
};
export const githubAddLabel: ConfigRules = {
  repository, issueNumber,
  label: { schema: z.string().refine((value) => value.trim().length > 0 && value.trim().length <= 50 && !/[\u0000-\u001f\u007f]/.test(value.trim())), required: true, message: "Enter a printable GitHub label up to 50 characters." },
};
export const githubAddComment: ConfigRules = {
  repository, issueNumber,
  body: { schema: z.string().refine((value) => !!value.trim() && value.length <= 65_536 && !/\u0000/.test(value)), required: true, message: "Enter a GitHub comment up to 65,536 characters." },
};
export const githubMerge: ConfigRules = {
  repository, pullRequestNumber,
  mergeMethod: { schema: optionalText.refine((value) => !value?.trim() || ["merge", "squash", "rebase"].includes(value.trim())), message: "Choose merge, squash, or rebase." },
  expectedHeadSha: { schema: optionalText.refine((value) => value === null || value === "" || /^[a-f0-9]{40}$/i.test(value.trim())), message: "Enter a full 40-character commit SHA." },
};
export const githubUpdateIssue: ConfigRules = {
  repository, issueNumber,
  field: { schema: z.enum(["title", "body", "state"]), message: "Choose an issue field to update." },
  title: { schema: z.string().refine((value) => !!value.trim() && value.trim().length <= 256), required: true, when: (config) => (config.field ?? "title") === "title", dependsOn: ["field"], message: "Enter a title up to 256 characters." },
  body: { schema: z.string().max(65_536), required: true, when: (config) => config.field === "body", dependsOn: ["field"], message: "Enter a description up to 65,536 characters." },
  state: { schema: z.enum(["open", "closed"]), required: true, when: (config) => config.field === "state", dependsOn: ["field"], message: "Choose open or closed." },
};
