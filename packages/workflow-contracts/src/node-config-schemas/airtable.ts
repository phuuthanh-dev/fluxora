import { z } from "zod";
import type { ConfigRules } from "./types";

const baseId = { schema: z.string().regex(/^app[A-Za-z0-9]{5,64}$/), required: true, message: "Choose an Airtable base." };
const tableId = { schema: z.string().regex(/^tbl[A-Za-z0-9]{5,64}$/), required: true, message: "Choose an Airtable table." };
const recordId = { schema: z.string().regex(/^rec[A-Za-z0-9]{5,64}$/), required: true, message: "Choose or enter an Airtable record ID." };
const fields = { schema: z.array(z.unknown()).min(1).max(50), required: true, message: "Add between 1 and 50 fields." };
export const airtableList: ConfigRules = { baseId, tableId, pageSize: { schema: z.number().int().min(1).max(100), message: "Choose between 1 and 100 records." }, cursor: { schema: z.string().max(1024).refine((value) => !/[\s\u0000-\u001f\u007f]/.test(value)), message: "Enter a valid page cursor." } };
export const airtableGet: ConfigRules = { baseId, tableId, recordId };
export const airtableCreate: ConfigRules = { baseId, tableId, fields };
export const airtableUpdate: ConfigRules = { baseId, tableId, recordId, fields };
