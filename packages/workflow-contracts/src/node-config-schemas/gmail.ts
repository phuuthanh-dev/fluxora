import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

const providerId = (label: string): FieldRule => ({ schema: z.string().refine((value) => /^[A-Za-z0-9_-]{1,128}$/.test(value.trim())), required: true, message: `Choose a valid Gmail ${label} ID.` });
const email = (value: string) => value.length <= 254 && !/[\x00-\x1f\x7f]/.test(value) && /^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value) && !value.includes("..");
const parseAddresses = (value: unknown): string[] | undefined => {
  const parts = typeof value === "string" ? value.split(",").map((item) => item.trim()) : value;
  return Array.isArray(parts) && parts.every((item) => typeof item === "string" && email(item)) ? parts : undefined;
};
const addresses = z.unknown().refine((value) => { const items = parseAddresses(value); return !!items && items.length > 0 && items.length <= 50; });
const optionalAddresses = z.unknown().refine((value) => value === "" || (Array.isArray(value) && value.length === 0) || addresses.safeParse(value).success);
const message: ConfigRules = {
  to: { schema: addresses, required: true, message: "Enter one or more valid recipient addresses.", dependsOn: ["cc", "bcc"], matches: (value, config) => (parseAddresses(value)?.length ?? 0) + (config.cc === "" || config.cc === undefined ? 0 : parseAddresses(config.cc)?.length ?? 0) + (config.bcc === "" || config.bcc === undefined ? 0 : parseAddresses(config.bcc)?.length ?? 0) <= 50 },
  cc: { schema: optionalAddresses, message: "Enter valid Cc addresses." },
  bcc: { schema: optionalAddresses, message: "Enter valid Bcc addresses." },
  text: { schema: z.string().refine((value) => new TextEncoder().encode(value).length <= 100_000 && !/\x00/.test(value)), required: true, message: "Enter message text up to 100 KB." },
};
const subject: FieldRule = { schema: z.string().max(800).refine((value) => !/[\x00-\x1f\x7f]/.test(value)), required: true, message: "Enter a subject up to 800 characters without control characters." };
export const gmailRead: ConfigRules = {
  query: { schema: z.string().max(470), message: "Enter a Gmail search query up to 470 characters." },
  limit: { schema: z.number().int().min(1).max(10), message: "Choose a limit between 1 and 10." },
  mailbox: { schema: z.enum(["all", "inbox", "unread"]), message: "Choose a valid Gmail mailbox." },
  collectPages: { schema: z.boolean(), message: "Choose whether to collect additional results." },
  pageToken: { schema: z.string().refine((value) => value === "" || /^[\x21-\x7e]{1,1024}$/.test(value)), message: "Enter a valid Gmail continuation token." },
};
export const gmailGet: ConfigRules = { messageId: providerId("message") };
export const gmailSend: ConfigRules = { ...message, subject };
export const gmailReply: ConfigRules = { ...message, messageId: providerId("message") };
export const gmailUpdateDraft: ConfigRules = { ...message, subject, draftId: providerId("draft") };
export const gmailLabel: ConfigRules = { messageId: providerId("message"), labelId: providerId("label"), labelAction: { schema: z.enum(["add", "remove"]), required: true, message: "Choose whether to add or remove the label." } };
