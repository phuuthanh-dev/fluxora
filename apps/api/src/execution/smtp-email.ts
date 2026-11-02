import nodemailer from "nodemailer";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { assertSafeOutboundHostname } from "./outbound-url-policy";

type RunMode = "mock" | "live";

type SmtpCredential = {
  host: string;
  port: 465 | 587;
  username: string;
  password: string;
  from: string;
};

type SmtpMessage = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  bodyFormat: "text" | "html";
  replyTo?: string;
};

/** Validates the encrypted SMTP payload before it is persisted or executed. */
export function validateSmtpCredentialData(value: Record<string, unknown>) {
  readSmtpCredential(value);
}

export type SmtpEmailDependencies = {
  sendMail?: (credential: SmtpCredential, message: SmtpMessage) => Promise<unknown>;
  assertSafeHost?: (host: string) => Promise<void>;
};

export async function executeSmtpEmail(
  config: Record<string, unknown>,
  mode: RunMode,
  workspaceId: string,
  credentials: CredentialService,
  dependencies: SmtpEmailDependencies = {},
) {
  const message = readSmtpMessage(config);
  const recipients = intendedRecipients(message);
  if (mode === "mock") {
    return {
      status: "succeeded" as const,
      output: normalizedDelivery("mock", message, recipients.size, "mock-smtp-message-id"),
      route: "success" as const,
    };
  }

  const credential = readSmtpCredential(
    await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.SMTP),
  );
  try {
    await (dependencies.assertSafeHost ?? assertSafeOutboundHostname)(credential.host);
  } catch (reason) {
    // No submission has started, so the outbound policy may safely classify retries.
    throw nodeFailureFromOutboundPolicy(reason);
  }
  let result: unknown;
  try {
    result = await (dependencies.sendMail ?? sendSmtpMail)(credential, message);
  } catch (reason) {
    throw smtpFailure(reason, recipients.size);
  }
  const receipt = readSubmissionReceipt(result, recipients);
  return {
    status: "succeeded" as const,
    output: normalizedDelivery("live", message, receipt.acceptedCount, receipt.messageId),
    route: "success" as const,
  };
}

function readSmtpCredential(value: Record<string, unknown>): SmtpCredential {
  const host = requiredText(value, "host").toLowerCase();
  if (!isSafeHostname(host)) throw new NodeFailure("CREDENTIAL_INVALID", "SMTP credential host must be a public hostname.", false);
  const port = value.port;
  if (port !== 465 && port !== 587) throw new NodeFailure("CREDENTIAL_INVALID", "SMTP credential port must be 465 or 587. Port 25 is not supported.", false);
  return {
    host,
    port,
    username: requiredText(value, "username"),
    password: requiredText(value, "password"),
    from: readSingleEmail(requiredText(value, "from"), "SMTP credential From address"),
  };
}

function readSmtpMessage(config: Record<string, unknown>): SmtpMessage {
  const subject = requiredText(config, "subject");
  const body = requiredText(config, "body");
  if (subject.length > 250) throw new NodeFailure("INVALID_CONFIGURATION", "Email subject must be at most 250 characters.", false);
  if (body.length > 200_000) throw new NodeFailure("INVALID_CONFIGURATION", "Email body must be at most 200,000 characters.", false);
  const bodyFormat = config.bodyFormat === "html" ? "html" : "text";
  const replyTo = optionalSingleEmail(config.replyTo, "Reply-to address");
  return {
    to: readRecipients(config.to, "To"),
    cc: readRecipients(config.cc, "Cc", true),
    bcc: readRecipients(config.bcc, "Bcc", true),
    subject,
    body,
    bodyFormat,
    ...(replyTo ? { replyTo } : {}),
  };
}

async function sendSmtpMail(credential: SmtpCredential, message: SmtpMessage): Promise<unknown> {
  const transporter = nodemailer.createTransport({
    host: credential.host,
    port: credential.port,
    secure: credential.port === 465,
    requireTLS: credential.port === 587,
    auth: { user: credential.username, pass: credential.password },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { servername: credential.host, minVersion: "TLSv1.2", rejectUnauthorized: true },
    logger: false,
    debug: false,
  });
  try {
    return await transporter.sendMail({
      from: credential.from,
      to: message.to,
      ...(message.cc.length ? { cc: message.cc } : {}),
      ...(message.bcc.length ? { bcc: message.bcc } : {}),
      subject: message.subject,
      ...(message.bodyFormat === "html" ? { html: message.body } : { text: message.body }),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
  } finally {
    transporter.close();
  }
}

function normalizedDelivery(mode: RunMode, message: SmtpMessage, acceptedCount: number, messageId?: string) {
  const count = message.to.length + message.cc.length + message.bcc.length;
  return {
    // Legacy compatibility: accepted for submission, never proof of inbox delivery.
    delivered: true,
    submissionStatus: "accepted" as const,
    acceptedCount,
    deliveryConfirmed: false,
    provider: "smtp",
    destination: `${count} recipient${count === 1 ? "" : "s"}`,
    ...(messageId ? { messageId } : {}),
    sentAt: new Date().toISOString(),
    mode,
  };
}

function intendedRecipients(message: SmtpMessage) {
  // Nodemailer merges and deduplicates To/Cc/Bcc when building the SMTP envelope.
  return new Set([...message.to, ...message.cc, ...message.bcc].map((address) => receiptAddress(address) ?? address));
}

function receiptAddress(value: unknown): string | undefined {
  const address = typeof value === "string" ? value : smtpRecord(value).address;
  if (typeof address !== "string" || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u.test(address)) return undefined;
  const separator = address.lastIndexOf("@");
  const domain = domainToASCII(address.slice(separator + 1)).toLowerCase();
  // Domains are case-insensitive and may be punycoded; mailbox local parts are not.
  return domain ? `${address.slice(0, separator)}@${domain}` : undefined;
}

function smtpRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function receiptRecipients(value: unknown, intended: Set<string>) {
  const addresses = new Set<string>();
  if (!Array.isArray(value)) return { addresses, valid: false };
  let valid = value.length <= intended.size;
  // Bound malformed receipts too; the configured recipient lists already have limits.
  for (const entry of value.slice(0, intended.size + 1)) {
    const address = receiptAddress(entry);
    if (!address || !intended.has(address) || addresses.has(address)) valid = false;
    else addresses.add(address);
  }
  return { addresses, valid };
}

function readSubmissionReceipt(result: unknown, intended: Set<string>) {
  const receipt = smtpRecord(result);
  const accepted = receiptRecipients(receipt.accepted, intended);
  const rejected = receiptRecipients(receipt.rejected, intended);
  let consistent = accepted.valid && rejected.valid;
  for (const address of accepted.addresses) {
    if (rejected.addresses.delete(address)) {
      accepted.addresses.delete(address);
      consistent = false;
    }
  }
  if (receipt.pending !== undefined && (!Array.isArray(receipt.pending) || receipt.pending.length !== 0)) consistent = false;
  if (receipt.rejectedErrors !== undefined) {
    const errors = receipt.rejectedErrors;
    if (!Array.isArray(errors) || errors.length !== rejected.addresses.size) consistent = false;
    else {
      const errorRecipients = receiptRecipients(errors.map((error) => smtpRecord(error).recipient), rejected.addresses);
      if (!errorRecipients.valid) consistent = false;
    }
  }
  const counts = {
    recipientCount: intended.size,
    acceptedCount: accepted.addresses.size,
    rejectedCount: rejected.addresses.size,
    unconfirmedCount: intended.size - accepted.addresses.size - rejected.addresses.size,
  };
  if (!consistent || counts.unconfirmedCount !== 0 || counts.acceptedCount === 0) {
    throw submissionFailure("DELIVERY_UNCERTAIN", counts);
  }
  if (counts.rejectedCount !== 0) throw submissionFailure("SMTP_PARTIAL_REJECTION", counts);
  return { acceptedCount: counts.acceptedCount, messageId: typeof receipt.messageId === "string" ? receipt.messageId : undefined };
}

function submissionFailure(
  code: "SMTP_PARTIAL_REJECTION" | "DELIVERY_UNCERTAIN",
  counts: { recipientCount: number; acceptedCount: number; rejectedCount: number; unconfirmedCount: number },
) {
  const summary = code === "SMTP_PARTIAL_REJECTION" ? "SMTP submission was only partially accepted." : "SMTP submission could not be confirmed.";
  return new NodeFailure(code,
    `${summary} recipientCount=${counts.recipientCount}, acceptedCount=${counts.acceptedCount}, rejectedCount=${counts.rejectedCount}, unconfirmedCount=${counts.unconfirmedCount}. Check the destination before retrying.`,
    false);
}

function smtpFailure(reason: unknown, recipientCount: number): NodeFailure {
  const error = smtpRecord(reason);
  const code = typeof error.code === "string" ? error.code : "";
  const responseCode = typeof error.responseCode === "number" && Number.isInteger(error.responseCode)
    && error.responseCode >= 400 && error.responseCode <= 599 ? error.responseCode : undefined;
  if (code === "EAUTH") return new NodeFailure("SMTP_AUTH_FAILED", "SMTP authentication failed.", false, responseCode);
  const uncertain = () => submissionFailure("DELIVERY_UNCERTAIN", {
    recipientCount, acceptedCount: 0, rejectedCount: 0, unconfirmedCount: recipientCount,
  });
  // A rejected promise with reported acceptance cannot prove a clean pre-submission rejection.
  if (error.accepted !== undefined && (!Array.isArray(error.accepted) || error.accepted.length > 0)) return uncertain();
  // A socket failure can occur after the server accepted DATA, even if its reply was lost.
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNRESET", "EPIPE", "ECONNABORTED"].includes(code)
    || error.name === "TimeoutError" || error.name === "AbortError") return uncertain();
  const command = typeof error.command === "string" ? error.command : "";
  const beforeData = ["CONN", "EHLO", "HELO", "STARTTLS", "MAIL FROM", "RCPT TO"].includes(command);
  const rejectionCode = ["", "EENVELOPE", "EPROTOCOL", "ETLS"].includes(code);
  if (beforeData && rejectionCode && responseCode !== undefined) {
    if (responseCode < 500) return new NodeFailure("SMTP_TEMPORARY", "SMTP temporarily rejected the message before submission.", true, responseCode);
    return new NodeFailure("SMTP_REJECTED", "SMTP rejected the message before submission.", false, responseCode);
  }
  // Without a known pre-DATA command, even a 4xx/5xx must not trigger a resend.
  if (code === "EENVELOPE" && !command && (responseCode === undefined || responseCode >= 500)) {
    return new NodeFailure("SMTP_REJECTED", "SMTP rejected the message envelope.", false, responseCode);
  }
  return uncertain();
}

function readRecipients(value: unknown, label: string, optional = false) {
  if ((value === undefined || value === null || value === "") && optional) return [];
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", `${label} recipients must be comma-separated email addresses.`, false);
  const recipients = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!recipients.length || recipients.length > 25) throw new NodeFailure("INVALID_CONFIGURATION", `${label} must contain between 1 and 25 email addresses.`, false);
  return recipients.map((item) => readSingleEmail(item, `${label} recipient`));
}

function optionalSingleEmail(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", `${label} must be an email address.`, false);
  return readSingleEmail(value, label);
}

function readSingleEmail(value: string, label: string) {
  const trimmed = value.trim();
  if (/[\r\n]/.test(trimmed) || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u.test(trimmed)) {
    throw new NodeFailure("INVALID_CONFIGURATION", `${label} must be a valid email address.`, false);
  }
  return trimmed;
}

function requiredText(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) throw new NodeFailure("INVALID_CONFIGURATION", `${key} is required.`, false);
  if (/[\r\n]/.test(value) && key !== "body") throw new NodeFailure("INVALID_CONFIGURATION", `${key} must not contain line breaks.`, false);
  return value.trim();
}

function readCredentialId(config: Record<string, unknown>) {
  const value = config.credentialId;
  if (typeof value !== "string" || !value) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a credential for this node.", false);
  return value;
}

function isSafeHostname(host: string) {
  return host.length <= 253
    && !host.includes(":")
    && isIP(host) === 0
    && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i.test(host);
}
