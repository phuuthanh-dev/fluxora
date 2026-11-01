import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { googleCalendarGet, isCalendarResourceId, listCalendarEvents } from "../execution/google-calendar";
import { NodeFailure } from "../execution/node-failure";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/google-calendar")
@UseGuards(AuthenticationGuard)
export class GoogleCalendarResourceController {
  protected readonly getCalendar = googleCalendarGet;
  protected readonly getEvents = listCalendarEvents;
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("calendars")
  async calendars(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("pageToken") pageToken?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    if (pageToken !== undefined && (pageToken.length > 512 || !/^[\x21-\x7e]+$/.test(pageToken))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Invalid page token." });
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
    const params = new URLSearchParams({ maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    let data: Record<string, unknown>;
    try { data = await this.getCalendar(`users/me/calendarList?${params}`, typeof credential.accessToken === "string" ? credential.accessToken : ""); }
    catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
    if (data.items !== undefined && !Array.isArray(data.items)) throw new BadRequestException({ code: "INVALID_RESPONSE", message: "Google Calendar returned an invalid calendar list." });
    const calendars = (Array.isArray(data.items) ? data.items : []).slice(0, 100).flatMap((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string" || !isCalendarResourceId(item.id)) return [];
      const name = typeof item.summaryOverride === "string" && item.summaryOverride.trim() ? item.summaryOverride : typeof item.summary === "string" && item.summary.trim() ? item.summary : "Untitled calendar";
      return [{ id: item.primary === true ? "primary" : item.id, name: `${name.slice(0, 200)}${item.primary === true ? " · primary" : ""}` }];
    });
    return { calendars, nextPageToken: typeof data.nextPageToken === "string" && data.nextPageToken.length <= 512 && /^[\x21-\x7e]+$/.test(data.nextPageToken) ? data.nextPageToken : null };
  }

  @Get("events")
  async events(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("calendarId") calendarId?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    if (!calendarId || !isCalendarResourceId(calendarId)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Select a calendar first." });
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
    try {
      const result = await this.getEvents(typeof credential.accessToken === "string" ? credential.accessToken : "", calendarId, 50);
      return { events: result.events.map((event) => ({ id: event.id, name: `${event.summary || "Untitled event"} · ${event.start || "time unavailable"}` })), hasMore: result.hasMore };
    } catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
  }
}
