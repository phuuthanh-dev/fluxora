import { z } from "zod";
import type { ConfigRules } from "./types";

const email = (value: string) => !/[\r\n]/.test(value.trim()) && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u.test(value.trim());
const recipients = (value: string) => {
  const addresses = value.split(",").map((item) => item.trim()).filter(Boolean);
  return addresses.length > 0 && addresses.length <= 25 && addresses.every(email);
};
const optionalRecipients = z.union([z.literal(""), z.null(), z.string().refine(recipients)]);
export const smtpEmail: ConfigRules = {
  to: { schema: z.string().refine(recipients), required: true, message: "Enter 1 to 25 valid email addresses." },
  cc: { schema: optionalRecipients, message: "Enter up to 25 valid Cc email addresses." },
  bcc: { schema: optionalRecipients, message: "Enter up to 25 valid Bcc email addresses." },
  replyTo: { schema: z.union([z.literal(""), z.null(), z.string().refine(email)]), message: "Enter a valid reply-to address." },
  subject: { schema: z.string().refine((value) => !!value.trim() && value.trim().length <= 250 && !/[\r\n]/.test(value)), required: true, message: "Enter a subject up to 250 characters without line breaks." },
  body: { schema: z.string().refine((value) => !!value.trim() && value.trim().length <= 200_000), required: true, message: "Enter a message up to 200,000 characters." },
  bodyFormat: { schema: z.enum(["text", "html"]), message: "Choose text or HTML for the email body." },
};
