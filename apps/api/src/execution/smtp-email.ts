import nodemailer from "nodemailer";
import { isIP } from "node:net";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { assertSafeOutboundHostname, OutboundRequestPolicyError } from "./outbound-url-policy";

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

type SendMailResult = { messageId?: unknown; accepted?: unknown };
export type SmtpEmailDependencies = {
  sendMail?: (credential: SmtpCredential, message: SmtpMessage) => Promise<SendMailResult>;
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
  if (mode === "mock") {
    return {
      status: "succeeded" as const,
      output: normalizedDelivery("mock", message, "mock-smtp-message-id"),
      route: "success" as const,
    };
  }

  const credential = readSmtpCredential(
    await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.SMTP),
  );
  try {
    await (dependencies.assertSafeHost ?? assertSafeOutboundHostname)(credential.host);
    const result = await (dependencies.sendMail ?? sendSmtpMail)(credential, message);
    return {
      status: "succeeded" as const,
      output: normalizedDelivery("live", message, typeof result.messageId === "string" ? result.messageId : undefined),
      route: "success" as const,
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof OutboundRequestPolicyError) throw nodeFailureFromOutboundPolicy(reason);
    throw smtpFailure(reason);
  }
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

async function sendSmtpMail(credential: SmtpCredential, message: SmtpMessage): Promise<SendMailResult> {
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

function normalizedDelivery(mode: RunMode, message: SmtpMessage, messageId?: string) {
  const count = message.to.length + message.cc.length + message.bcc.length;
  return {
    delivered: true,
    provider: "smtp",
    destination: `${count} recipient${count === 1 ? "" : "s"}`,
    ...(messageId ? { messageId } : {}),
    sentAt: new Date().toISOString(),
    mode,
  };
}

function smtpFailure(reason: unknown): NodeFailure {
  const error = reason && typeof reason === "object" ? reason as { code?: unknown; responseCode?: unknown; name?: unknown } : {};
  const code = typeof error.code === "string" ? error.code : "";
  const responseCode = typeof error.responseCode === "number" ? error.responseCode : undefined;
  if (code === "EAUTH") return new NodeFailure("SMTP_AUTH_FAILED", "SMTP authentication failed.", false, responseCode);
  if (code === "EENVELOPE") return new NodeFailure("SMTP_REJECTED", "SMTP rejected the message envelope.", false, responseCode);
  if (code === "ETIMEDOUT" || error.name === "TimeoutError") return new NodeFailure("TIMEOUT", "SMTP delivery timed out.", true);
  if (responseCode !== undefined) {
    if (responseCode >= 400 && responseCode < 500) return new NodeFailure("SMTP_TEMPORARY", "SMTP temporarily rejected the message.", true, responseCode);
    return new NodeFailure("SMTP_REJECTED", "SMTP rejected the message.", false, responseCode);
  }
  return new NodeFailure("NETWORK_ERROR", "SMTP delivery failed.", true);
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
