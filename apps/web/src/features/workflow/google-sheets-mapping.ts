export type SheetHeader = { column: number; name: string };
export type SheetsMappingDraft = {
  kind: "sheets";
  baseline: string;
  tab: string;
  headers: SheetHeader[] | null;
  mappedValues: string[] | null;
};

export function sheetsBaseline(workspaceId: string, config: Record<string, unknown>): string {
  return JSON.stringify({ workspaceId, credentialId: config.credentialId, spreadsheetId: config.spreadsheetId, operation: config.operation, range: config.range, values: config.values });
}

export function literalSheetTitle(title: string): boolean {
  return Boolean(title.trim()) && title.length <= 100 && !/[\x00-\x1f\x7f]/.test(title) && !title.includes("{{");
}

export function sheetRange(title: string, operation: unknown): string {
  if (!literalSheetTitle(title)) throw new Error("Enter a literal tab name.");
  return `'${title.replace(/'/g, "''")}'!${operation === "read" ? "A:CV" : "A1"}`;
}

export function columnLabel(column: number): string {
  let result = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

export function applySheetsMapping(workspaceId: string, config: Record<string, unknown>, draft: SheetsMappingDraft): Record<string, unknown> {
  if (sheetsBaseline(workspaceId, config) !== draft.baseline) throw new Error("The connection, spreadsheet, operation, range or values changed. Discard this preview and start again.");
  if (draft.mappedValues !== null && (config.operation !== "append" || !draft.headers || draft.mappedValues.length !== draft.headers.length || !draft.headers.length)) throw new Error("The row mapping is no longer valid. Discard this preview and start again.");
  return { ...config, range: sheetRange(draft.tab, config.operation), ...(draft.mappedValues === null ? {} : { values: [draft.mappedValues] }) };
}
