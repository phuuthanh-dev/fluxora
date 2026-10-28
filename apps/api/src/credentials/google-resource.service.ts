import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { CredentialService } from "./credential.service";

@Injectable()
export class GoogleResourceService {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  async listFiles(workspaceId: string, credentialId: string, userId: string, kind: "file" | "spreadsheet", pageToken?: string) {
    await this.credentials.requireOwner(workspaceId, userId);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId);
    const token = typeof credential.accessToken === "string" ? credential.accessToken.trim() : "";
    if (!token) throw new BadRequestException({ code: "GOOGLE_CREDENTIAL_INVALID", message: "Google connection is missing an access token." });
    const params = new URLSearchParams({ pageSize: "100", fields: "nextPageToken,files(id,name,mimeType)", q: kind === "spreadsheet" ? "trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'" : "trashed = false and mimeType contains 'text/'" });
    if (pageToken) params.set("pageToken", pageToken);
    let response: Response;
    try {
      response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new BadRequestException({ code: "GOOGLE_RESOURCE_UNAVAILABLE", message: "Google files could not be loaded right now." });
    }
    if (!response.ok) throw new BadRequestException({ code: response.status === 401 || response.status === 403 ? "GOOGLE_CREDENTIAL_INVALID" : "GOOGLE_RESOURCE_UNAVAILABLE", message: response.status === 401 || response.status === 403 ? "Google rejected this connection or its file permissions." : "Google files could not be loaded right now." });
    const payload: unknown = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray((payload as Record<string, unknown>).files)) throw new BadRequestException({ code: "GOOGLE_RESOURCE_INVALID", message: "Google returned an invalid file list." });
    const data = payload as { files: unknown[]; nextPageToken?: unknown };
    const files = data.files.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const file = item as Record<string, unknown>;
      return typeof file.id === "string" && typeof file.name === "string" && typeof file.mimeType === "string" ? [{ id: file.id, name: file.name, mimeType: file.mimeType }] : [];
    });
    const nextPageToken = typeof data.nextPageToken === "string" && data.nextPageToken.length <= 512 && /^[\x21-\x7e]+$/.test(data.nextPageToken) ? data.nextPageToken : null;
    return { files, nextPageToken };
  }
}
