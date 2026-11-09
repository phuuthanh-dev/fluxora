import { isCalendarResourceId } from "@workflow/contracts";
import { googleCalendarGet } from "../execution/google-calendar";
import { NodeFailure } from "../execution/node-failure";
import { assertNoCredentialInProviderFields } from "../execution/provider-credential-safety";

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const tokenValid = (value: string) => value.length > 0 && value.length <= 2048 && /^[\x21-\x7e]+$/.test(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";

/** A sync token is advanced only when the last page has been processed. */
export async function calendarSyncPage(accessToken: string, calendarId: string, syncToken?: string, pageToken?: string, get = googleCalendarGet) {
  if (!accessToken || /\s/.test(accessToken) || accessToken.length > 4096 || !isCalendarResourceId(calendarId) || (syncToken !== undefined && !tokenValid(syncToken)) || (pageToken !== undefined && !tokenValid(pageToken))) throw new NodeFailure("INVALID_INPUT", "Select a calendar and reconnect if necessary.", false);
  const params = new URLSearchParams({ maxResults: "100", showDeleted: "true" });
  if (syncToken) params.set("syncToken", syncToken);
  if (pageToken) params.set("pageToken", pageToken);
  let data: Record<string, unknown>;
  try { data = await get(`calendars/${encodeURIComponent(calendarId)}/events?${params}`, accessToken); }
  catch (error) { if (error instanceof NodeFailure && error.statusCode === 410) throw new NodeFailure("CALENDAR_SYNC_EXPIRED", "Calendar sync expired. Review and reset the trigger before activating again.", false); throw error; }
  if (data.items !== undefined && (!Array.isArray(data.items) || data.items.length > 100)) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid event page.", false);
  const nextPage = typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : null;
  const nextSync = typeof data.nextSyncToken === "string" && data.nextSyncToken ? data.nextSyncToken : null;
  if ((nextPage && !tokenValid(nextPage)) || (nextSync && !tokenValid(nextSync)) || Boolean(nextPage) === Boolean(nextSync) || nextPage?.includes(accessToken) || nextSync?.includes(accessToken)) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned invalid synchronization state.", false);
  const events = (Array.isArray(data.items) ? data.items : []).map((item: unknown) => {
    const event = record(item); const start = record(event?.start); const end = record(event?.end);
    if (typeof event?.id !== "string" || event.id.length > 1024 || (event.etag !== undefined && (typeof event.etag !== "string" || event.etag.length > 1024)) || typeof event.status !== "string" || event.status.length > 50) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an invalid event identifier or revision.", false);
    const id = event.id; const etag = typeof event.etag === "string" ? event.etag : ""; const status = event.status;
    if (!id || !status || (status !== "cancelled" && !etag) || /[\u0000-\u001f\u007f]/.test(id + etag + status)) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an event without a valid identifier or revision.", false);
    const created = text(event?.created, 100);
    if (status !== "cancelled" && (!created || !Number.isFinite(Date.parse(created)))) throw new NodeFailure("INVALID_RESPONSE", "Google Calendar returned an event without a valid creation time.", false);
    const result = { id, etag, status, created, summary: text(event?.summary, 1000), start: text(start?.dateTime ?? start?.date, 100), end: text(end?.dateTime ?? end?.date, 100), updated: text(event?.updated, 100) };
    assertNoCredentialInProviderFields(Object.values(result), accessToken);
    return result;
  });
  return { events, nextPage, nextSync };
}
