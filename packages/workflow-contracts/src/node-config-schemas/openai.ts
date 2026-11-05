import { z } from "zod";
import { aiConfigRules } from "./ai-common";

export const openai = aiConfigRules(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/));
