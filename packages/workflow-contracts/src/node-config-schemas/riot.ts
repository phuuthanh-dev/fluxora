import { z } from "zod";
import { riotLolActions, riotLolPlatforms, riotTftActions } from "../riot-lol";
import type { ConfigRules } from "./types";

const op = (config: Record<string, unknown>) => config.operation ?? "accountByRiotId";
const isRiotId = (config: Record<string, unknown>) => op(config) === "accountByRiotId";
const identifier = z.string().refine((value) => !!value.trim() && value.length <= 100 && /^[A-Za-z0-9_-]+$/.test(value.trim()));
const integer = (min: number, max: number) => z.union([z.string(), z.number()]).refine((value) => value === "" || ((typeof value === "number" || /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max));
const date = z.string().refine((value) => !value || (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) >= 0));
const common = (game: "lol" | "tft"): ConfigRules => ({
  operation: { schema: z.string().refine((value) => (game === "lol" ? riotLolActions : riotTftActions).some((item) => item.id === value)), message: "Choose a supported Riot operation." },
  platform: { schema: z.string().refine((value) => riotLolPlatforms.some(([id]) => id === value)), message: "Choose a valid Riot server." },
  gameName: { schema: z.string().refine((value) => !!value.trim() && value.length <= 100 && !/[\/\\?#\u0000-\u001f\u007f]/.test(value)), required: true, when: isRiotId, message: "Enter a valid Riot ID game name." },
  tagLine: { schema: z.string().refine((value) => !!value.trim().replace(/^#/, "") && value.length <= 20 && !/[\/\\?\u0000-\u001f\u007f]/.test(value) && !value.trim().replace(/^#/, "").includes("#")), required: true, when: isRiotId, message: "Enter a valid Riot ID tag." },
  puuid: { schema: identifier, required: true, when: (config) => !["accountByRiotId", "status", "match", "timeline"].includes(String(op(config))), message: "Enter a valid player PUUID." },
  matchId: { schema: identifier, required: true, when: (config) => ["match", "timeline"].includes(String(op(config))), message: "Enter a valid match ID." },
  start: { schema: integer(0, 1000), when: (config) => op(config) === "matchIds", message: "Enter a start offset between 0 and 1,000." },
  count: { schema: integer(1, 100), when: (config) => ["matchIds", "topMasteries"].includes(String(op(config))), message: "Choose a count between 1 and 100." },
});
export const riotTft = common("tft");
export const riotLol: ConfigRules = {
  ...common("lol"),
  matchFilter: { schema: z.enum(["all", "ranked", "normal", "tourney", "tutorial", "queue:420", "queue:440", "queue:400", "queue:450"]), when: (config) => op(config) === "matchIds", message: "Choose a valid match filter." },
  startTime: { schema: date, when: (config) => op(config) === "matchIds", message: "Enter a valid match date with timezone." },
  endTime: { schema: date, when: (config) => op(config) === "matchIds", dependsOn: ["operation", "startTime"], matches: (value, config) => !value || !config.startTime || (typeof value === "string" && typeof config.startTime === "string" && Date.parse(value) >= Date.parse(config.startTime)), message: "Choose an end date after the start date." },
};
