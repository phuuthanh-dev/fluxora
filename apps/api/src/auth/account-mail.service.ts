import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import nodemailer from "nodemailer";
import { PrismaService } from "../database/prisma.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";

export function accountMailConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.ACCOUNT_MAIL_ENABLED !== "true") return null;
  const host = env.ACCOUNT_SMTP_HOST;
  const port = Number(env.ACCOUNT_SMTP_PORT);
  const user = env.ACCOUNT_SMTP_USER;
  const pass = env.ACCOUNT_SMTP_PASSWORD;
  const from = env.ACCOUNT_MAIL_FROM;
  if (!host || !/^[a-z\d.-]+$/i.test(host) || ![465, 587].includes(port) || !user || !pass || !from || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(from)) {
    throw new Error("Configure ACCOUNT_SMTP_HOST/PORT/USER/PASSWORD and ACCOUNT_MAIL_FROM; TLS port must be 465 or 587.");
  }
  if (Buffer.from(env.APP_ENCRYPTION_KEY ?? "", "base64").length !== 32) throw new Error("Account mail requires a valid APP_ENCRYPTION_KEY.");
  let origin: URL;
  try { origin = new URL(env.WEB_ORIGIN ?? "http://localhost:3000"); }
  catch { throw new Error("WEB_ORIGIN must be a trusted origin."); }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || !["http:", "https:"].includes(origin.protocol) || (env.NODE_ENV === "production" && origin.protocol !== "https:")) {
    throw new Error("WEB_ORIGIN must be a trusted origin, using HTTPS in production.");
  }
  return { host, port, user, pass, from, origin: origin.origin };
}

export type AccountMessage = { to: string; subject: string; text: string };

@Injectable()
export class AccountMailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountMailService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialVaultService) private readonly vault: CredentialVaultService) {}

  config() { return accountMailConfig(); }
  encode(message: AccountMessage) { return this.vault.encrypt(message); }

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || !this.config()) return;
    this.timer = setInterval(() => {
      if (!this.running) this.running = this.flush().catch(() => { this.logger.error("Account mail processing failed; inspect database and mail configuration."); }).finally(() => { this.running = undefined; });
    }, 5000);
    this.timer.unref();
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.running; }

  async flush(send: (message: AccountMessage) => Promise<void> = message => this.send(message)) {
    const now = new Date();
    // A crash after dispatch is uncertain, never a reason to send the same mail again.
    await this.prisma.accountMail.updateMany({ where: { OR: [{ state: "SENDING", updatedAt: { lt: new Date(now.getTime() - 120_000) } }, { state: "PENDING", expiresAt: { lte: now } }] }, data: { state: "FAILED", encryptedPayload: null } });
    await this.prisma.accountMail.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 86400_000) }, state: { in: ["SENT", "FAILED"] } } });
    await this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86400_000) } } });
    const pending = await this.prisma.accountMail.findMany({ where: { state: "PENDING", expiresAt: { gt: now } }, orderBy: { createdAt: "asc" }, take: 10 });
    for (const mail of pending) {
      const claim = await this.prisma.accountMail.updateMany({ where: { id: mail.id, state: "PENDING", expiresAt: { gt: new Date() } }, data: { state: "SENDING" } });
      if (!claim.count) continue;
      let state: "SENT" | "FAILED" = "FAILED";
      try {
        const message = this.vault.decrypt(mail.encryptedPayload ?? "");
        if (typeof message.to !== "string" || typeof message.subject !== "string" || typeof message.text !== "string") throw new Error("Invalid account mail payload");
        await send({ to: message.to, subject: message.subject, text: message.text });
        state = "SENT";
      } catch { this.logger.warn("Account mail delivery failed or is uncertain; the user can request another link."); }
      await this.prisma.accountMail.update({ where: { id: mail.id }, data: { state, encryptedPayload: null } });
    }
  }

  private async send(message: AccountMessage) {
    const config = this.config();
    if (!config) throw new Error("Account mail unavailable");
    const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, requireTLS: true,
      auth: { user: config.user, pass: config.pass }, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, logger: false, debug: false });
    try {
      const result = await transport.sendMail({ from: config.from, ...message, disableFileAccess: true, disableUrlAccess: true });
      if (!result.accepted.length) throw new Error("Account mail not accepted");
    } finally { transport.close(); }
  }
}
