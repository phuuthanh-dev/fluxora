import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

export const isCalendarResourceId = (value: string) => Boolean(value) && value.length <= 512 && value !== "." && value !== ".." && !/[\\/%\x00-\x1f\x7f]/.test(value);
const calendarId: FieldRule = { schema: z.string().refine((value) => isCalendarResourceId(value.trim())), message: "Choose a valid Google Calendar." };
const eventId: FieldRule = { schema: z.string().refine((value) => isCalendarResourceId(value.trim())), required: true, message: "Choose a valid event." };
const timestamp = z.string().refine((value) => /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i.test(value) && Number.isFinite(Date.parse(value)));
const optionalTimestamp = z.union([z.literal(""), timestamp]);
const start: FieldRule = { schema: timestamp, required: true, message: "Choose a valid start time with timezone." };
const end: FieldRule = { schema: timestamp, required: true, dependsOn: ["start"], matches: (value, config) => typeof value === "string" && typeof config.start === "string" && Date.parse(value) > Date.parse(config.start), message: "Choose an end time after the start time." };
const summary = z.string().refine((value) => !!value.trim() && value.trim().length <= 500);
const description = { schema: z.string().max(10_000), message: "Enter a description up to 10,000 characters." };
const location = { schema: z.string().max(1000), message: "Enter a location up to 1,000 characters." };
const sendUpdates = { schema: z.enum(["none", "all", "externalOnly"]), message: "Choose how to send event updates." };
export const calendarList: ConfigRules = {
  calendarId,
  limit: { schema: z.number().int().min(1).max(50), message: "Choose a limit between 1 and 50." },
  timeMin: { schema: optionalTimestamp, message: "Enter a valid start time with timezone." },
  pageToken: { schema: z.string().refine((value) => value === "" || /^[\x21-\x7e]{1,512}$/.test(value)), dependsOn: ["timeMin"], matches: (value, config) => value === "" || (typeof config.timeMin === "string" && !!config.timeMin.trim()), message: "A page token requires the original start time." },
};
export const calendarCreate: ConfigRules = {
  calendarId, summary: { schema: summary, required: true, message: "Enter an event title up to 500 characters." }, start, end, description, location, sendUpdates,
  attendees: { schema: z.string().refine((value) => {
    const items = value.trim() ? value.trim().split(",").map((item) => item.trim()) : [];
    return items.length <= 20 && items.every((email) => email.length <= 320 && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email));
  }), message: "Enter up to 20 valid attendee email addresses." },
};
export const calendarEvent: ConfigRules = { calendarId: { ...calendarId, required: true }, eventId, sendUpdates };
export const calendarUpdate: ConfigRules = {
  ...calendarEvent,
  summary: { schema: z.string().max(500), message: "Enter an event title up to 500 characters." }, description, location,
  start: { schema: optionalTimestamp, dependsOn: ["end"], matches: (value, config) => !value || (typeof config.end === "string" && !!config.end), message: "Provide start and end times together." },
  end: { schema: optionalTimestamp, dependsOn: ["start"], matches: (value, config) => !value ? !config.start : typeof value === "string" && typeof config.start === "string" && Date.parse(value) > Date.parse(config.start), message: "Choose an end time after the start time." },
};
export const calendarAvailability: ConfigRules = { calendarId: { ...calendarId, required: true }, start, end };
