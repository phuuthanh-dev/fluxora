import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = typeof fetchSafeOutbound;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export async function googleCalendarGet(path: string, token: string, transport: Transport = fetchSafeOutbound) {
  let response: Response;
  try { response = await transport(`https://www.googleapis.com/calendar/v3/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("CALENDAR_UNAVAILABLE", "Google Calendar could not be reached.", true); }
  if (!response.ok) throw new NodeFailure("CALENDAR_ERROR", `Google Calendar returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid response.", false); }
  const result = record(payload);
  if (!result) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid response.", false);
  return result;
}

export async function listCalendarEvents(token: string, calendarId: string, limit: number, transport: Transport = fetchSafeOutbound, now = new Date()) {
  if (!token || /\s/.test(token) || token.length > 4096 || !calendarId || calendarId.length > 512 || /[\x00-\x1f\x7f]/.test(calendarId) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new NodeFailure("INVALID_INPUT", "Select a calendar and limit between 1 and 50.", false);
  const query = new URLSearchParams({ timeMin: now.toISOString(), maxResults: String(limit), singleEvents: "true", orderBy: "startTime" });
  const data = await googleCalendarGet(`calendars/${encodeURIComponent(calendarId)}/events?${query}`, token, transport);
  if (data.items !== undefined && !Array.isArray(data.items)) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid event list.", false);
  const events = (Array.isArray(data.items) ? data.items : []).slice(0, limit).map((raw: unknown) => {
    const event = record(raw) ?? {}; const start = record(event.start); const end = record(event.end);
    const text = (value: unknown, max = 1000) => typeof value === "string" ? value.slice(0, max) : "";
    return { id: text(event.id), summary: text(event.summary), description: text(event.description, 10000), start: text(start?.dateTime ?? start?.date), end: text(end?.dateTime ?? end?.date), timeZone: text(start?.timeZone), location: text(event.location), status: text(event.status) };
  });
  return { events, count: events.length, hasMore: typeof data.nextPageToken === "string" && !!data.nextPageToken };
}

export async function executeGoogleCalendar(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read = listCalendarEvents) {
  const calendarId = typeof config.calendarId === "string" ? config.calendarId.trim() : "primary";
  const limit = config.limit === undefined ? 10 : config.limit;
  if (!calendarId || calendarId.length > 512 || /[\x00-\x1f\x7f]/.test(calendarId) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new NodeFailure("INVALID_INPUT", "Select a calendar and limit between 1 and 50.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { events: [{ id: "example-event", summary: "Example event", description: "", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z", timeZone: "UTC", location: "", status: "confirmed" }], count: 1, hasMore: false }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Calendar connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
  return { status: "succeeded" as const, output: await read(typeof credential.accessToken === "string" ? credential.accessToken : "", calendarId, limit), route: "success" as const };
}
