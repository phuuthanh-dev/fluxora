import { z } from "zod";
import type { ConfigRules } from "./types";

const writes = (config: Record<string, unknown>) => config.operation === "append" || config.operation === "update";
export const googleSheets: ConfigRules = {
  operation: { schema: z.enum(["read", "append", "update"]), message: "Choose a Google Sheets operation." },
  spreadsheetId: { schema: z.string().refine((value) => !!value.trim()), required: true, message: "Choose a spreadsheet." },
  range: { schema: z.string().refine((value) => !!value.trim()), required: true, message: "Enter a spreadsheet range." },
  values: { schema: z.array(z.array(z.unknown())), required: true, when: writes, message: "Enter a table of rows to write." },
  valueInputOption: { schema: z.enum(["USER_ENTERED", "RAW"]), when: writes, message: "Choose how Google Sheets should interpret values." },
};
