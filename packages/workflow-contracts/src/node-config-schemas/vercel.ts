import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

const team: FieldRule = { schema: z.string().refine((value) => value === "personal" || /^team_[A-Za-z0-9]{1,100}$/.test(value)), message: "Choose a Vercel account or team." };
export const vercelListDeployments: ConfigRules = {
  team,
  project: { schema: z.string().regex(/^prj_[A-Za-z0-9]{1,100}$/), required: true, message: "Choose a Vercel project." },
  limit: { schema: z.number().int().min(1).max(100), message: "Choose a limit between 1 and 100." },
  cursor: { schema: z.union([z.string(), z.number()]).refine((value) => value === "" || (/^(0|[1-9][0-9]{0,15})$/.test(String(value)) && Number.isSafeInteger(Number(value)))), message: "Enter a valid cursor for Vercel." },
};
export const vercelPublicDeployment: ConfigRules = {
  team,
  deploymentId: { schema: z.string().regex(/^dpl_[A-Za-z0-9]{1,100}$/), required: true, message: "Choose a Vercel deployment." },
};
