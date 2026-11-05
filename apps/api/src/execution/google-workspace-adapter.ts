import { randomBytes } from "node:crypto";
import { NodeFailure } from "./node-failure";
import { readCredentialValue } from "./connector-config";
import { driveListOutput, driveListUrl, readDriveCollectPages, readDrivePageToken } from "./google-drive-pagination";
import { readBoundedProviderText } from "./provider-json";
import { isReadOnlyMethod, requireProviderSuccess, readProviderJson, uncertainDelivery } from "./provider-request-policy";

export function mockDrive(config: Record<string, unknown>, paginated: boolean) {
  const operation = readOperation(config, ["list", "search", "uploadText", "downloadText"], "list");
  if (operation === "downloadText") return { operation, file: { id: String(config.fileId ?? "mock-file-1"), name: "daily-report.txt", text: "Mock Drive report" } };
  if (operation === "uploadText") return { operation, file: { id: "mock-upload-1", name: String(config.name ?? "daily-report.txt"), mimeType: "text/plain" } };
  const body = { files: [{ id: "mock-file-1", name: "Steam report", mimeType: "text/plain", modifiedTime: "2026-10-23T08:00:00.000Z" }] };
  return paginated ? driveListOutput(operation, body) : { operation, ...body };
}

export async function executeGoogleDrive(credential: Record<string, unknown>, config: Record<string, unknown>, paginated: boolean) {
  const accessToken = readCredentialValue(credential, "accessToken");
  const operation = readOperation(config, ["list", "search", "uploadText", "downloadText"], "list");
  if (operation === "downloadText") {
    const fileId = readConfigString(config, "fileId");
    const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, accessToken);
    try {
      return { operation, file: { id: fileId, text: await readBoundedProviderText(response) } };
    } catch (reason) {
      if (reason instanceof NodeFailure) throw reason;
      throw new NodeFailure("NETWORK_ERROR", "Google Drive response could not be read.", true);
    }
  }
  if (operation === "uploadText") {
    const name = readConfigString(config, "name");
    const content = typeof config.text === "string" ? config.text : "";
    const boundary = `workflow-${randomBytes(8).toString("hex")}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: "text/plain" })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const response = await googleFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType", accessToken, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    const file = await readProviderJson(response, "Google Drive", true);
    if (!file || typeof file !== "object" || Array.isArray(file) || typeof (file as Record<string, unknown>).id !== "string") throw uncertainDelivery("Google Drive", response.status);
    return { operation, file };
  }
  if (!paginated) {
    const query = operation === "search" && typeof config.query === "string" && config.query ? `&q=${encodeURIComponent(config.query)}` : "";
    const response = await googleFetch(`https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,modifiedTime,webViewLink)${query}`, accessToken);
    const body = await readProviderJson(response, "Google Drive") as { files?: unknown[] } | null;
    if (!body || !Array.isArray(body.files)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Drive returned an invalid file list.", false);
    return { operation, files: body.files };
  }
  const pageToken = readDrivePageToken(config);
  if (readDriveCollectPages(config)) {
    const files: unknown[] = [];
    let next = pageToken;
    const seen = new Set<string>(pageToken === undefined ? [] : [pageToken]);
    for (let request = 0; request < 5; request++) {
      const remaining = 100 - files.length;
      const response = await googleFetch(driveListUrl(operation, config, next, remaining), accessToken);
      const page = driveListOutput(operation, await readProviderJson(response, "Google Drive"), accessToken, remaining);
      files.push(...page.files);
      if (page.nextPageToken === null) return driveListOutput(operation, { files }, accessToken);
      if (seen.has(page.nextPageToken)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Drive returned a repeated continuation token.", false);
      next = page.nextPageToken;
      seen.add(next);
      if (files.length >= 100 || request === 4) return driveListOutput(operation, { files, nextPageToken: next }, accessToken);
    }
    throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Drive pagination did not complete.", false);
  }
  const response = await googleFetch(driveListUrl(operation, config, pageToken), accessToken);
  const body = await readProviderJson(response, "Google Drive");
  return driveListOutput(operation, body, accessToken);
}

export function mockSheets(config: Record<string, unknown>) {
  const operation = readOperation(config, ["read", "append", "update"], "read");
  const range = String(config.range ?? "Sheet1!A1");
  if (operation === "read") return { operation, range, values: [["Mock Steam Player", "42 games"]] };
  const spreadsheetId = typeof config.spreadsheetId === "string" && config.spreadsheetId ? config.spreadsheetId : "mock-spreadsheet";
  const updates = { spreadsheetId, updatedRange: range, updatedRows: 1, updatedColumns: 2, updatedCells: 2 };
  // Keep the original mock-only top-level fields for saved test workflows.
  return operation === "append" ? { operation, range, updatedRows: 1, updatedCells: 2, spreadsheetId, tableRange: "", updates } : { operation, range, ...updates };
}

export function readSheetsInputOption(config: Record<string, unknown>): "USER_ENTERED" | "RAW" {
  if (!Object.hasOwn(config, "valueInputOption")) return "USER_ENTERED";
  if (config.valueInputOption !== "USER_ENTERED" && config.valueInputOption !== "RAW") {
    throw new NodeFailure("INVALID_INPUT", "Choose how Google Sheets should interpret values.", false);
  }
  return config.valueInputOption;
}

export async function executeGoogleSheets(credential: Record<string, unknown>, config: Record<string, unknown>, inputOption: "USER_ENTERED" | "RAW" = "USER_ENTERED") {
  const accessToken = readCredentialValue(credential, "accessToken");
  const spreadsheetId = readConfigString(config, "spreadsheetId");
  const range = readConfigString(config, "range");
  const operation = readOperation(config, ["read", "append", "update"], "read");
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  if (operation === "read") {
    const response = await googleFetch(base, accessToken);
    return { operation, ...await readGoogleRecord(response, false) };
  }
  const values = normalizeValues(config.values);
  const response = operation === "append"
    ? await googleFetch(`${base}:append?valueInputOption=${inputOption}`, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) })
    : await googleFetch(`${base}?valueInputOption=${inputOption}`, accessToken, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
  return { operation, ...await readGoogleRecord(response, true) };
}

async function readGoogleRecord(response: Response, write: boolean) {
  const value = await readProviderJson(response, "Google Sheets", write);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (write) throw uncertainDelivery("Google Sheets", response.status);
    throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Sheets returned an invalid response.", false);
  }
  return value as Record<string, unknown>;
}

async function googleFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const write = !isReadOnlyMethod(init.method);
  try {
    // Do not let fetch replay a write automatically on a 307/308 redirect.
    const response = await fetch(url, { ...init, ...(write ? { redirect: "manual" as const } : {}), headers: { Authorization: `Bearer ${accessToken}`, ...init.headers }, signal: AbortSignal.timeout(20_000) });
    if (write && response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw uncertainDelivery("Google API", response.status);
    }
    await requireProviderSuccess(response, "Google API", write, "GOOGLE_API_ERROR");
    return response;
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (write) throw uncertainDelivery("Google API");
    throw new NodeFailure("NETWORK_ERROR", "Google API request failed.", true);
  }
}

export function readOperation(config: Record<string, unknown>, values: string[], fallback: string) {
  return typeof config.operation === "string" && values.includes(config.operation) ? config.operation : fallback;
}

function readConfigString(config: Record<string, unknown>, key: string) {
  if (typeof config[key] !== "string" || !config[key]) throw new NodeFailure("INVALID_CONFIGURATION", `${key} is required.`, false);
  return config[key] as string;
}

function normalizeValues(value: unknown) {
  if (!Array.isArray(value) || !value.every((row) => Array.isArray(row))) throw new NodeFailure("INVALID_CONFIGURATION", "values must be a table (an array of rows).", false);
  return value;
}
