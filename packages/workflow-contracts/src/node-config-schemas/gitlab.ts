import { z } from "zod";
import type { ConfigRules } from "./types";

const id = z.union([z.string().regex(/^[1-9]\d{0,15}$/).refine((value) => Number.isSafeInteger(Number(value))), z.number().int().positive().safe()]);
const project = { schema: id, required: true, message: "Choose a GitLab project or enter its numeric ID." };
const issue = { schema: id, required: true, message: "Choose an issue or enter its project issue number." };
export const gitlabProject: ConfigRules = { project };
export const gitlabIssue: ConfigRules = { project, issue };
export const gitlabListIssues: ConfigRules = { project, state: { schema: z.enum(["all", "opened", "closed"]), message: "Choose an issue state." }, page: { schema: id.refine((value) => Number(value) <= 10000), message: "Choose a page from 1 to 10,000." }, pageSize: { schema: z.number().int().min(1).max(100), message: "Choose 1 to 100 issues." } };
export const gitlabCreateIssue: ConfigRules = { project, title: { schema: z.string().trim().min(1).max(255), required: true, message: "Enter an issue title of at most 255 characters." }, description: { schema: z.string().max(10000), message: "Description is limited to 10,000 characters." } };
export const gitlabComment: ConfigRules = { project, issue, body: { schema: z.string().trim().min(1).max(10000), required: true, message: "Enter a comment of at most 10,000 characters." } };
export const gitlabUpdateIssue: ConfigRules = { ...gitlabIssue, title: { schema: z.string().trim().min(1).max(255), required: true, message: "Enter an issue title of at most 255 characters." }, description: { schema: z.string().max(10000), message: "Description is limited to 10,000 characters." } };
export const gitlabGetPipeline: ConfigRules = { project, pipeline: { schema: id, required: true, message: "Enter a pipeline ID." } };
export const gitlabGetMergeRequest: ConfigRules = { project, mergeRequest: { schema: id, required: true, message: "Enter a merge request number." } };
export const gitlabPipeline: ConfigRules = { project, status: { schema: z.enum(["all", "success", "failed", "canceled"]), message: "Choose a pipeline status." } };
export const gitlabMergeRequest: ConfigRules = { project, action: { schema: z.enum(["all", "open", "update", "merge", "close", "reopen"]), message: "Choose a merge request event." } };
