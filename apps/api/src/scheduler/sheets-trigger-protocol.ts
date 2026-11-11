import { createHash } from "node:crypto";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { readBoundedProviderJson } from "../execution/provider-json";
import { assertNoCredentialInProviderValue } from "../execution/provider-credential-safety";
import { NodeFailure } from "../execution/node-failure";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const limit = 1000;
type Snapshot = { headerHash: string; rows: Array<{ key: string; item: Record<string, unknown> }> };
export type SheetsCheckpoint = { v: 1; headerHash: string; keys: string[] };

/** Read a complete, bounded sheet. A unique stable key is required for each nonempty row. */
export async function readSheetSnapshot(token: string, spreadsheetId: string, sheet: string, keyColumn: string, transport: typeof fetchSafeOutbound = fetchSafeOutbound): Promise<Snapshot> {
  if (!token || /\s/.test(token) || token.length > 4096) throw new NodeFailure("CREDENTIAL_REQUIRED", "Reconnect the Google connection.", false);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(spreadsheetId) || !sheet.trim() || sheet.length > 100 || /[\x00-\x1f\x7f]/.test(sheet) || !keyColumn.trim() || keyColumn.length > 256) throw new NodeFailure("INVALID_INPUT", "Choose a spreadsheet, tab and unique column.", false);
  const range = `'${sheet.replace(/'/g, "''")}'!A1:CW1002`;
  let response: Response;
  try { response = await transport(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("SHEETS_UNAVAILABLE", "Google Sheets could not be reached.", true); }
  if (!response.ok) throw new NodeFailure("SHEETS_ERROR", `Google Sheets returned ${response.status}. Check the connection and spreadsheet access.`, response.status === 429 || response.status >= 500, response.status);
  const data = await readBoundedProviderJson(response);
  assertNoCredentialInProviderValue(data, token);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new NodeFailure("INVALID_RESPONSE", "Google Sheets returned invalid data.", false);
  const values = (data as Record<string, unknown>).values;
  if (!Array.isArray(values) || !values.every(Array.isArray) || values.length > limit + 1) throw new NodeFailure("SHEETS_TRIGGER_LIMIT", "The sheet must have a header and at most 1,000 rows.", false);
  const rawHeader = values[0] as unknown[] | undefined;
  if (!rawHeader || rawHeader.length < 1 || rawHeader.length > 100 || rawHeader.some((v) => typeof v !== "string" || !v.trim() || v.length > 256 || ["__proto__", "constructor", "prototype"].includes(v))) throw new NodeFailure("SHEETS_TRIGGER_HEADER", "Give each column a unique non-empty header.", false);
  const headers = rawHeader as string[];
  if (new Set(headers).size !== headers.length || !headers.includes(keyColumn)) throw new NodeFailure("SHEETS_TRIGGER_HEADER", "Choose a unique column header in the sheet.", false);
  const keyIndex = headers.indexOf(keyColumn), keys = new Set<string>();
  const rows: Snapshot["rows"] = [];
  for (let index = 1; index < values.length; index++) {
    const row = values[index] as unknown[];
    if (row.length > headers.length || row.some((v) => !["string", "number", "boolean"].includes(typeof v) || (typeof v === "number" && !Number.isFinite(v)))) throw new NodeFailure("SHEETS_TRIGGER_ROW", "A row has invalid values or more columns than the header.", false);
    if (row.every((v) => v === "")) continue;
    const rawKey = row[keyIndex];
    if (rawKey === undefined || String(rawKey).trim() === "" || String(rawKey).length > 256) throw new NodeFailure("SHEETS_TRIGGER_KEY", "Each populated row needs a unique value in the key column.", false);
    const key = hash(JSON.stringify(rawKey));
    if (keys.has(key)) throw new NodeFailure("SHEETS_TRIGGER_KEY", "The key column contains duplicate values.", false);
    keys.add(key);
    const item: Record<string, unknown> = Object.create(null);
    headers.forEach((header, column) => { item[header] = row[column] ?? ""; });
    rows.push({ key, item: { rowNumber: index + 1, values: item } });
  }
  return { headerHash: hash(JSON.stringify(headers)), rows };
}

export function sheetCheckpoint(snapshot: Snapshot): SheetsCheckpoint { return { v: 1, headerHash: snapshot.headerHash, keys: snapshot.rows.map((row) => row.key) }; }
export function sheetChanges(cursor: string, snapshot: Snapshot) {
  let checkpoint: SheetsCheckpoint;
  try { checkpoint = JSON.parse(cursor) as SheetsCheckpoint; } catch { throw new NodeFailure("SHEETS_TRIGGER_CHECKPOINT", "The sheet checkpoint is invalid.", false); }
  if (checkpoint?.v !== 1 || !/^[a-f0-9]{64}$/.test(checkpoint.headerHash) || !Array.isArray(checkpoint.keys) || checkpoint.keys.length > limit || checkpoint.keys.some((key) => !/^[a-f0-9]{64}$/.test(key)) || new Set(checkpoint.keys).size !== checkpoint.keys.length) throw new NodeFailure("SHEETS_TRIGGER_CHECKPOINT", "The sheet checkpoint is invalid.", false);
  if (checkpoint.headerHash !== snapshot.headerHash) throw new NodeFailure("SHEETS_TRIGGER_HEADER_CHANGED", "Sheet headers changed. Deactivate and review the checkpoint.", false);
  const current = new Set(snapshot.rows.map((row) => row.key));
  if (checkpoint.keys.some((key) => !current.has(key))) throw new NodeFailure("SHEETS_TRIGGER_KEY_REMOVED", "A saved row key was removed or changed. Deactivate and review the checkpoint.", false);
  const previous = new Set(checkpoint.keys);
  return { cursor: JSON.stringify(sheetCheckpoint(snapshot)), changes: snapshot.rows.filter((row) => !previous.has(row.key)).map((row) => ({ key: row.key, item: row.item, event: "created" as const })) };
}
