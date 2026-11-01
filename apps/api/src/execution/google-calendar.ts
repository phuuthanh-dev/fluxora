import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { createHash } from "node:crypto";

type Transport = typeof fetchSafeOutbound;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const isCalendarResourceId = (value: string) => Boolean(value) && value.length <= 512 && value !== "." && value !== ".." && !/[\\/%\x00-\x1f\x7f]/.test(value);

export async function googleCalendarGet(path: string, token: string, transport: Transport = fetchSafeOutbound) {
  let url: URL;
  try { url = new URL(`https://www.googleapis.com/calendar/v3/${path}`); } catch { throw new NodeFailure("INVALID_INPUT", "Google Calendar request target is invalid.", false); }
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.port || url.username || url.password || !url.pathname.startsWith("/calendar/v3/")) throw new NodeFailure("INVALID_INPUT", "Google Calendar request target is invalid.", false);
  let response: Response;
  try { response = await transport(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("CALENDAR_UNAVAILABLE", "Google Calendar could not be reached.", true); }
  if (!response.ok) throw new NodeFailure("CALENDAR_ERROR", `Google Calendar returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid response.", false); }
  const result = record(payload);
  if (!result) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid response.", false);
  return result;
}

export async function listCalendarEvents(token: string, calendarId: string, limit: number, transport: Transport = fetchSafeOutbound, now = new Date(), pageToken?: string) {
  if (!token || /\s/.test(token) || token.length > 4096 || !isCalendarResourceId(calendarId) || !Number.isInteger(limit) || limit < 1 || limit > 50 || (pageToken !== undefined && (pageToken.length > 512 || !/^[\x21-\x7e]+$/.test(pageToken)))) throw new NodeFailure("INVALID_INPUT", "Select a calendar, a valid page token and limit between 1 and 50.", false);
  const query = new URLSearchParams({ timeMin: now.toISOString(), maxResults: String(limit), singleEvents: "true", orderBy: "startTime" });
  if (pageToken) query.set("pageToken", pageToken);
  const data = await googleCalendarGet(`calendars/${encodeURIComponent(calendarId)}/events?${query}`, token, transport);
  if (data.items !== undefined && !Array.isArray(data.items)) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid event list.", false);
  const events = (Array.isArray(data.items) ? data.items : []).slice(0, limit).map((raw: unknown) => {
    const event = record(raw) ?? {}; const start = record(event.start); const end = record(event.end);
    const text = (value: unknown, max = 1000) => typeof value === "string" ? value.slice(0, max) : "";
    return { id: text(event.id), summary: text(event.summary), description: text(event.description, 10000), start: text(start?.dateTime ?? start?.date), end: text(end?.dateTime ?? end?.date), timeZone: text(start?.timeZone), location: text(event.location), status: text(event.status) };
  });
  const nextPageToken = typeof data.nextPageToken === "string" && data.nextPageToken.length <= 512 && /^[\x21-\x7e]+$/.test(data.nextPageToken) ? data.nextPageToken : null;
  return { events, count: events.length, hasMore: Boolean(nextPageToken), nextPageToken, timeMin: now.toISOString() };
}

export async function executeGoogleCalendar(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read = listCalendarEvents) {
  const calendarId = typeof config.calendarId === "string" ? config.calendarId.trim() : "primary";
  const limit = config.limit === undefined ? 10 : config.limit;
  const pageToken = typeof config.pageToken === "string" && config.pageToken ? config.pageToken : undefined;
  const timeMin = typeof config.timeMin === "string" ? config.timeMin.trim() : "";
  if (!isCalendarResourceId(calendarId) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50 || (pageToken !== undefined && (pageToken.length > 512 || !/^[\x21-\x7e]+$/.test(pageToken) || !timeMin)) || (timeMin && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i.test(timeMin) || !Number.isFinite(Date.parse(timeMin))))) throw new NodeFailure("INVALID_INPUT", "Select a calendar and valid limit. When using a page token, also use the original start time.", false);
  const start = timeMin ? new Date(timeMin) : new Date();
  if (mode === "mock") return { status: "succeeded" as const, output: { events: [{ id: "example-event", summary: "Example event", description: "", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z", timeZone: "UTC", location: "", status: "confirmed" }], count: 1, hasMore: false, nextPageToken: null, timeMin: start.toISOString() }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Calendar connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
  return { status: "succeeded" as const, output: await read(typeof credential.accessToken === "string" ? credential.accessToken : "", calendarId, limit, undefined, start, pageToken), route: "success" as const };
}

type CreateCalendarInput = { calendarId: string; summary: string; start: string; end: string; description: string; location: string; attendees: string[]; sendUpdates: "none" | "all" | "externalOnly" };

function readCreateInput(config: Record<string, unknown>): CreateCalendarInput {
  const calendarId = typeof config.calendarId === "string" ? config.calendarId.trim() : "primary";
  const summary = typeof config.summary === "string" ? config.summary.trim() : "";
  const start = typeof config.start === "string" ? config.start : "";
  const end = typeof config.end === "string" ? config.end : "";
  const description = typeof config.description === "string" ? config.description : "";
  const location = typeof config.location === "string" ? config.location : "";
  const rawAttendees = typeof config.attendees === "string" ? config.attendees.trim() : "";
  const attendees = rawAttendees ? rawAttendees.split(",").map((item) => item.trim()) : [];
  const sendUpdates = config.sendUpdates === undefined ? "none" : config.sendUpdates;
  const rfc3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i;
  if (!isCalendarResourceId(calendarId) || !summary || summary.length > 500 || description.length > 10000 || location.length > 1000 || !rfc3339.test(start) || !rfc3339.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start) || attendees.length > 20 || attendees.some((email) => email.length > 320 || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) || (sendUpdates !== "none" && sendUpdates !== "all" && sendUpdates !== "externalOnly")) throw new NodeFailure("INVALID_INPUT", "Choose a calendar, enter an event title and valid start/end times, and check attendee addresses.", false);
  return { calendarId, summary, start, end, description, location, attendees, sendUpdates };
}

export async function createCalendarEvent(token: string, input: CreateCalendarInput, executionId: string, nodeId: string, transport: Transport = fetchSafeOutbound) {
  if (!token || /\s/.test(token) || token.length > 4096 || !executionId || !nodeId || !isCalendarResourceId(input.calendarId)) throw new NodeFailure("INVALID_INPUT", "Calendar connection or execution reference is invalid.", false);
  const marker = createHash("sha256").update(`${executionId}\0${nodeId}`).digest("hex");
  // Google accepts base32hex event IDs; hexadecimal is a valid subset.
  const id = marker.slice(0, 40);
  const path = `calendars/${encodeURIComponent(input.calendarId)}/events`;
  const body = { id, summary: input.summary, description: input.description, location: input.location, start: { dateTime: input.start }, end: { dateTime: input.end }, attendees: input.attendees.map((email) => ({ email })), extendedProperties: { private: { fluxoraRun: marker } } };
  let response: Response;
  try { response = await transport(`https://www.googleapis.com/calendar/v3/${path}?${new URLSearchParams({ sendUpdates: input.sendUpdates })}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("CALENDAR_UNAVAILABLE", "Google Calendar could not be reached. A retry will check for the same event.", true); }
  if (response.status === 409) {
    let existing: Record<string, unknown>;
    try { existing = await googleCalendarGet(`${path}/${id}`, token, transport); }
    catch (error) { if (error instanceof NodeFailure && error.statusCode === 404) throw new NodeFailure("CALENDAR_CONFIRMATION_UNKNOWN", "Calendar event creation could not yet be confirmed. Retry will check the same event.", true); throw error; }
    const properties = record(record(existing.extendedProperties)?.private);
    if (properties?.fluxoraRun !== marker) throw new NodeFailure("CALENDAR_EVENT_CONFLICT", "A different calendar event uses this ID. Review the calendar before retrying.", false, 409);
    const existingStart = record(existing.start); const existingEnd = record(existing.end);
    return { id, summary: typeof existing.summary === "string" ? existing.summary.slice(0, 500) : "", start: typeof existingStart?.dateTime === "string" ? existingStart.dateTime : "", end: typeof existingEnd?.dateTime === "string" ? existingEnd.dateTime : "", recovered: true };
  }
  if (!response.ok) throw new NodeFailure("CALENDAR_ERROR", `Google Calendar returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  let data: unknown;
  try { data = await readBoundedProviderJson(response); } catch { throw new NodeFailure("CALENDAR_CONFIRMATION_UNKNOWN", "Calendar event creation could not be confirmed. Retry will check the same event.", true); }
  const event = record(data);
  if (!event || event.id !== id) throw new NodeFailure("CALENDAR_CONFIRMATION_UNKNOWN", "Calendar event creation could not be confirmed. Retry will check the same event.", true);
  return { id, summary: input.summary, start: input.start, end: input.end, recovered: false };
}

export async function executeGoogleCalendarCreate(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, executionId: string, nodeId: string, create = createCalendarEvent) {
  const input = readCreateInput(config);
  if (mode === "mock") return { status: "succeeded" as const, output: { id: "example-event", summary: input.summary, start: input.start, end: input.end, mocked: true }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Calendar connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
  return { status: "succeeded" as const, output: await create(typeof credential.accessToken === "string" ? credential.accessToken : "", input, executionId, nodeId), route: "success" as const };
}

export async function executeGoogleCalendarEvent(config: Record<string, unknown>, operation: "get" | "update" | "delete", mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const calendarId = typeof config.calendarId === "string" ? config.calendarId.trim() : "";
  const eventId = typeof config.eventId === "string" ? config.eventId.trim() : "";
  if (!isCalendarResourceId(calendarId) || !isCalendarResourceId(eventId)) throw new NodeFailure("INVALID_INPUT", "Select a calendar and event.", false);
  const summary = typeof config.summary === "string" ? config.summary.trim() : "";
  const description = typeof config.description === "string" ? config.description : "";
  const location = typeof config.location === "string" ? config.location : "";
  const start = typeof config.start === "string" ? config.start : "";
  const end = typeof config.end === "string" ? config.end : "";
  const sendUpdates = config.sendUpdates === undefined ? "none" : config.sendUpdates;
  const rfc3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i;
  if ((sendUpdates !== "none" && sendUpdates !== "all" && sendUpdates !== "externalOnly") || summary.length > 500 || description.length > 10000 || location.length > 1000 || (operation === "update" && ((!summary && !description && !location && !start && !end) || Boolean(start) !== Boolean(end) || Boolean(start) && (!rfc3339.test(start) || !rfc3339.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start))))) throw new NodeFailure("INVALID_INPUT", "Enter at least one change; provide valid start and end times together.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { id: eventId, operation, mocked: true }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Calendar connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  if (!token || token.length > 4096 || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_REQUIRED", "The Google Calendar connection is invalid.", false);
  const path = `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  if (operation === "get") {
    const event = await googleCalendarGet(path, token, transport); const eventStart = record(event.start); const eventEnd = record(event.end);
    const text = (value: unknown, max = 1000) => typeof value === "string" ? value.slice(0, max) : "";
    return { status: "succeeded" as const, output: { id: text(event.id), summary: text(event.summary), description: text(event.description, 10000), location: text(event.location), start: text(eventStart?.dateTime ?? eventStart?.date), end: text(eventEnd?.dateTime ?? eventEnd?.date), status: text(event.status) }, route: "success" as const };
  }
  const body = { ...(summary ? { summary } : {}), ...(description ? { description } : {}), ...(location ? { location } : {}), ...(start ? { start: { dateTime: start }, end: { dateTime: end } } : {}) };
  let response: Response;
  try { response = await transport(`https://www.googleapis.com/calendar/v3/${path}?${new URLSearchParams({ sendUpdates })}`, { method: operation === "delete" ? "DELETE" : "PATCH", headers: { Authorization: `Bearer ${token}`, ...(operation === "update" ? { "Content-Type": "application/json" } : {}) }, ...(operation === "update" ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) }); }
  catch {
    if (operation === "update" && sendUpdates !== "none") throw new NodeFailure("CALENDAR_UPDATE_OUTCOME_UNKNOWN", "The update may have been applied and invitations may have been sent. Check the event before retrying.", false);
    throw new NodeFailure("CALENDAR_UNAVAILABLE", "Google Calendar could not be reached.", true);
  }
  if (operation === "delete" && (response.status === 404 || response.status === 410)) return { status: "succeeded" as const, output: { id: eventId, deleted: false, alreadyAbsentOrInaccessible: true }, route: "success" as const };
  if (!response.ok) {
    if (operation === "update" && sendUpdates !== "none" && response.status >= 500) throw new NodeFailure("CALENDAR_UPDATE_OUTCOME_UNKNOWN", "The update may have been applied and invitations may have been sent. Check the event before retrying.", false);
    throw new NodeFailure("CALENDAR_ERROR", `Google Calendar returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  }
  if (operation === "delete") return { status: "succeeded" as const, output: { id: eventId, deleted: true, alreadyAbsentOrInaccessible: false }, route: "success" as const };
  let raw: unknown; try { raw = await readBoundedProviderJson(response); } catch { throw new NodeFailure("CALENDAR_UPDATE_OUTCOME_UNKNOWN", "The update may have been applied. Check the event and notifications before retrying.", false); }
  const event = record(raw); if (!event || typeof event.id !== "string" || event.id !== eventId) throw new NodeFailure("CALENDAR_UPDATE_OUTCOME_UNKNOWN", "The update may have been applied. Check the event and notifications before retrying.", false);
  return { status: "succeeded" as const, output: { id: eventId, updated: true }, route: "success" as const };
}

export async function executeGoogleCalendarAvailability(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const calendarId = typeof config.calendarId === "string" ? config.calendarId.trim() : "";
  const start = typeof config.start === "string" ? config.start : "";
  const end = typeof config.end === "string" ? config.end : "";
  const rfc3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i;
  if (!isCalendarResourceId(calendarId) || !rfc3339.test(start) || !rfc3339.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw new NodeFailure("INVALID_INPUT", "Select a calendar and valid start/end times.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { available: true, busy: [], mocked: true }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Calendar connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  if (!token || token.length > 4096 || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_REQUIRED", "The Google Calendar connection is invalid.", false);
  let response: Response;
  try { response = await transport("https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id: calendarId }] }), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("CALENDAR_UNAVAILABLE", "Google Calendar could not be reached.", true); }
  if (!response.ok) throw new NodeFailure("CALENDAR_ERROR", `Google Calendar returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  let raw: unknown; try { raw = await readBoundedProviderJson(response); } catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid response.", false); }
  const calendars = record(record(raw)?.calendars);
  const entries = calendars ? Object.entries(calendars) : [];
  const calendar = record(calendars?.[calendarId] ?? (entries.length === 1 ? entries[0]?.[1] : null));
  if (!calendar || (calendar.errors !== undefined && (!Array.isArray(calendar.errors) || calendar.errors.length > 0)) || !Array.isArray(calendar.busy)) throw new NodeFailure("CALENDAR_AVAILABILITY_UNAVAILABLE", "Calendar availability could not be determined. Check access and try again.", false);
  const busy = calendar.busy.map((value: unknown) => record(value)).map((item) => {
    if (typeof item?.start !== "string" || typeof item?.end !== "string" || !rfc3339.test(item.start) || !rfc3339.test(item.end) || !Number.isFinite(Date.parse(item.start)) || !Number.isFinite(Date.parse(item.end)) || Date.parse(item.end) <= Date.parse(item.start)) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned invalid busy times.", false);
    return { start: item.start, end: item.end };
  });
  return { status: "succeeded" as const, output: { available: busy.length === 0, busy }, route: "success" as const };
}
