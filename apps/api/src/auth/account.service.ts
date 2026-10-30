import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import * as argon2 from "argon2";
import { PrismaService } from "../database/prisma.service";
import { AccountMailService } from "./account-mail.service";

export const hashAccountToken = (token: string) => createHash("sha256").update(token).digest("hex");
const accountSelect = { id: true, email: true, displayName: true, avatarColor: true, passwordHash: true } as const;
const invalidReset = () => new BadRequestException({ code: "RESET_LINK_INVALID", message: "This reset link has expired or has already been used. Request a new link." });

@Injectable()
export class AccountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AccountMailService) private readonly mail: AccountMailService) {}

  async account(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: accountSelect });
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Account was not found." });
    const { passwordHash, ...safe } = user;
    return { ...safe, hasPassword: Boolean(passwordHash) };
  }
  async rename(userId: string, displayName: string) {
    await this.prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { displayName } });
      await this.audit(tx, userId, "auth.profile_updated");
    });
    return this.account(userId);
  }
  async sessions(userId: string, token: string) {
    const sessions = await this.prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, tokenHash: true, createdAt: true, expiresAt: true } });
    return sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === hashAccountToken(token) }));
  }
  async revoke(userId: string, token: string, id?: string) {
    return this.prisma.$transaction(async tx => {
      const current = id ? await tx.session.findFirst({ where: { id, userId }, select: { tokenHash: true } }) : null;
      if (id && !current) throw new NotFoundException({ code: "SESSION_NOT_FOUND", message: "Session was not found." });
      await tx.session.updateMany({ where: { userId, revokedAt: null, ...(id ? { id } : { tokenHash: { not: hashAccountToken(token) } }) }, data: { revokedAt: new Date() } });
      await this.audit(tx, userId, id ? "auth.session_revoked" : "auth.other_sessions_revoked");
      return { current: current?.tokenHash === hashAccountToken(token) };
    });
  }
  async changePassword(userId: string, currentPassword: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) throw new UnauthorizedException({ code: "CURRENT_PASSWORD_INVALID", message: "Your current password is incorrect." });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, userId);
      const updated = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (!updated.count) throw new UnauthorizedException({ code: "PASSWORD_CHANGED", message: "Your password changed. Sign in again." });
      await this.invalidate(tx, userId);
      await this.audit(tx, userId, "auth.password_changed");
      await this.notice(tx, userId);
    });
  }
  async forgot(email: string) {
    const config = this.mail.config();
    if (!config) throw new ServiceUnavailableException({ code: "RECOVERY_UNAVAILABLE", message: "Password recovery is temporarily unavailable. Please contact support." });
    const started = Date.now();
    try {
      const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
      if (!user) return;
      await this.prisma.$transaction(async tx => {
        await this.lock(tx, user.id);
        // Account-wide cooldown survives API restarts and concurrent requests.
        const recent = await tx.passwordReset.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
        if (recent) return;
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 30 * 60_000);
        await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
        await tx.accountMail.updateMany({ where: { userId: user.id, kind: "PASSWORD_RESET", state: "PENDING" }, data: { state: "FAILED", encryptedPayload: null } });
        await tx.passwordReset.create({ data: { userId: user.id, tokenHash: hashAccountToken(token), expiresAt } });
        // Fragments are not sent to the web server or in Referer headers.
        const url = `${config.origin}/reset-password#token=${token}`;
        await tx.accountMail.create({ data: { userId: user.id, kind: "PASSWORD_RESET", expiresAt, encryptedPayload: this.mail.encode({ to: user.email, subject: "Reset your Fluxora password", text: `Open this link to set a new password:\n${url}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email. Your password has not changed.` }) } });
      });
    } finally { await delay(Math.max(0, 300 - (Date.now() - started))); }
  }
  async reset(token: string, password: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidReset();
    const tokenHash = hashAccountToken(token);
    const request = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!request || request.usedAt || request.expiresAt <= new Date()) throw invalidReset();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, request.userId);
      const consumed = await tx.passwordReset.updateMany({ where: { id: request.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!consumed.count) throw invalidReset();
      await tx.user.update({ where: { id: request.userId }, data: { passwordHash } });
      await this.invalidate(tx, request.userId);
      await this.audit(tx, request.userId, "auth.password_reset");
      await this.notice(tx, request.userId);
    });
  }
  private async invalidate(tx: Prisma.TransactionClient, userId: string) {
    const now = new Date();
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
    await tx.accountMail.updateMany({ where: { userId, kind: "PASSWORD_RESET", state: "PENDING" }, data: { state: "FAILED", encryptedPayload: null } });
  }
  private lock(tx: Prisma.TransactionClient, userId: string) { return tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`; }
  private audit(tx: Prisma.TransactionClient, userId: string, action: string) { return tx.auditLog.create({ data: { actorId: userId, action, targetType: "user", targetId: userId } }); }
  private async notice(tx: Prisma.TransactionClient, userId: string) {
    if (!this.mail.config()) return;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    await tx.accountMail.create({ data: { userId, kind: "PASSWORD_CHANGED", expiresAt: new Date(Date.now() + 86400_000), encryptedPayload: this.mail.encode({ to: user.email, subject: "Your Fluxora password changed", text: "Your password was changed and existing sessions were signed out. If this was not you, request a password reset from Fluxora and contact support. We will never ask for your password." }) } });
  }
}
