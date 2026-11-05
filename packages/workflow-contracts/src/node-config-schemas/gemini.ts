import { z } from "zod";
import { aiConfigRules } from "./ai-common";

export const gemini = aiConfigRules(z.string().regex(/^(?:models\/)?[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/));
