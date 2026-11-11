import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { CredentialService } from "./credential.service";
import { readBoundedProviderJson } from "../execution/provider-json";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";

function spreadsheetId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a literal spreadsheet ID to discover metadata." });
  return value;
}

function sheetTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100 || /[\x00-\x1f\x7f]/.test(value) || value.includes("{{")) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a literal sheet tab name to discover headers." });
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

@Injectable()
export class GoogleResourceService {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  protected sheetsFetch: typeof fetchSafeOutbound = fetchSafeOutbound;

  private async sheetsJson(workspaceId: string, credentialId: string, userId: string, path: string) {
    await this.credentials.requireOwner(workspaceId, userId);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId);
    const token = typeof credential.accessToken === "string" ? credential.accessToken.trim() : "";
    if (!token) throw new BadRequestException({ code: "GOOGLE_CREDENTIAL_INVALID", message: "Google connection is missing an access token." });
    let response: Response;
    try {
      response = await this.sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new BadRequestException({ code: "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE", message: "Google Sheets metadata could not be loaded. Enter a range manually or use an expression." });
    }
    if (!response.ok) {
      const denied = response.status === 401 || response.status === 403 || response.status === 404;
      throw new BadRequestException({ code: denied ? "GOOGLE_SHEETS_DISCOVERY_DENIED" : "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE", message: denied ? "Google could not authorize access to this spreadsheet or it was not found. Check the connection and sharing, or enter a range manually or use an expression." : "Google Sheets metadata could not be loaded. Enter a range manually or use an expression." });
    }
    try { return await readBoundedProviderJson(response); }
    catch { throw new BadRequestException({ code: "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE", message: "Google Sheets returned invalid or oversized metadata. Enter a range manually or use an expression." }); }
  }

  async listSheetTabs(workspaceId: string, credentialId: string, userId: string, id: unknown) {
    const safeId = spreadsheetId(id);
    const payload = record(await this.sheetsJson(workspaceId, credentialId, userId, `${encodeURIComponent(safeId)}?fields=sheets(properties(sheetId,title))`));
    if (!payload || !Array.isArray(payload.sheets)) throw new BadRequestException({ code: "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE", message: "Google Sheets returned invalid metadata. Enter a range manually or use an expression." });
    const tabs = payload.sheets.slice(0, 100).flatMap((sheet: unknown) => {
      const properties = record(record(sheet)?.properties);
      if (!properties || !Number.isSafeInteger(properties.sheetId) || (properties.sheetId as number) < 0 || typeof properties.title !== "string" || !properties.title.trim() || properties.title.length > 100 || /[\x00-\x1f\x7f]/.test(properties.title)) return [];
      return [{ id: properties.sheetId as number, title: properties.title }];
    });
    return { tabs, hasMore: payload.sheets.length > 100 };
  }

  async getSheetHeaders(workspaceId: string, credentialId: string, userId: string, id: unknown, sheet: unknown) {
    const safeId = spreadsheetId(id);
    const title = sheetTitle(sheet);
    // Quoted A1 notation prevents a tab title from becoming an arbitrary range.
    const range = `'${title.replace(/'/g, "''")}'!A1:CV1`;
    const payload = record(await this.sheetsJson(workspaceId, credentialId, userId, `${encodeURIComponent(safeId)}/values/${encodeURIComponent(range)}?fields=values`));
    if (!payload || (payload.values !== undefined && (!Array.isArray(payload.values) || payload.values.length > 1 || (payload.values.length > 0 && !Array.isArray(payload.values[0]))))) throw new BadRequestException({ code: "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE", message: "Google Sheets returned invalid headers. Enter a range manually or use an expression." });
    const row: unknown[] = Array.isArray(payload.values) && Array.isArray(payload.values[0]) ? payload.values[0] : [];
    if (row.length > 100 || row.some((cell) => typeof cell !== "string" || cell.length > 256)) throw new BadRequestException({ code: "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE", message: "Google Sheets returned invalid or oversized headers. Enter a range manually or use an expression." });
    return { headers: row.map((name, index) => ({ column: index + 1, name })), columnLimit: 100 };
  }

  async listFiles(workspaceId: string, credentialId: string, userId: string, kind: "file" | "spreadsheet" | "folder" | "all", pageToken?: string) {
    await this.credentials.requireOwner(workspaceId, userId);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId);
    const token = typeof credential.accessToken === "string" ? credential.accessToken.trim() : "";
    if (!token) throw new BadRequestException({ code: "GOOGLE_CREDENTIAL_INVALID", message: "Google connection is missing an access token." });
    const mimeQuery = kind === "spreadsheet" ? "mimeType = 'application/vnd.google-apps.spreadsheet'" : kind === "folder" ? "mimeType = 'application/vnd.google-apps.folder'" : "mimeType contains 'text/'";
    const params = new URLSearchParams({ pageSize: "100", fields: "nextPageToken,files(id,name,mimeType)", q: kind === "all" ? "trashed = false" : `trashed = false and ${mimeQuery}` });
    if (pageToken) params.set("pageToken", pageToken);
    let response: Response;
    try {
      response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new BadRequestException({ code: "GOOGLE_RESOURCE_UNAVAILABLE", message: "Google files could not be loaded right now." });
    }
    if (!response.ok) throw new BadRequestException({ code: response.status === 401 || response.status === 403 ? "GOOGLE_CREDENTIAL_INVALID" : "GOOGLE_RESOURCE_UNAVAILABLE", message: response.status === 401 || response.status === 403 ? "Google rejected this connection or its file permissions." : "Google files could not be loaded right now." });
    const payload: unknown = kind === "all" ? await readBoundedProviderJson(response).catch(() => null) : await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray((payload as Record<string, unknown>).files)) throw new BadRequestException({ code: "GOOGLE_RESOURCE_INVALID", message: "Google returned an invalid file list." });
    const data = payload as { files: unknown[]; nextPageToken?: unknown };
    if (kind === "all" && (data.files.length > 100 || data.files.some((item) => {
      const file = record(item);
      return !file || typeof file.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(file.id) || typeof file.name !== "string" || file.name.length > 1024 || typeof file.mimeType !== "string" || file.mimeType.length > 256 || [file.id, file.name, file.mimeType].some((value) => value.includes(token));
    }) || (data.nextPageToken !== undefined && (typeof data.nextPageToken !== "string" || data.nextPageToken.length > 2048 || !/^[\x21-\x7e]+$/.test(data.nextPageToken) || data.nextPageToken.includes(token))))) throw new BadRequestException({ code: "GOOGLE_RESOURCE_INVALID", message: "Google returned an invalid file list." });
    const files = data.files.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const file = item as Record<string, unknown>;
      return typeof file.id === "string" && typeof file.name === "string" && typeof file.mimeType === "string" ? [{ id: file.id, name: file.name, mimeType: file.mimeType }] : [];
    });
    const nextPageToken = typeof data.nextPageToken === "string" && data.nextPageToken.length <= 2048 && /^[\x21-\x7e]+$/.test(data.nextPageToken) ? data.nextPageToken : null;
    return { files, nextPageToken };
  }
}
