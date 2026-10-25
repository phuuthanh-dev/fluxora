import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { AuthIdentityProvider } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const AVATAR_COLORS = ["lime", "violet", "sky", "coral"] as const;

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarColor: string;
};

export type AuthSession = {
  token: string;
  user: AuthenticatedUser;
};

export type ExternalIdentity = {
  provider: AuthIdentityProvider;
  providerAccountId: string;
  email: string;
  displayName?: string | null;
};

export type IdentitySummary = { provider: AuthIdentityProvider; providerAccountId: string; updatedAt: Date };

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException({ code: "EMAIL_TAKEN", message: "An account already uses this email." });
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const token = this.createSessionToken();
    const tokenHash = this.hashSessionToken(token);
    const displayName = dto.displayName?.trim() || null;
    const workspaceName = displayName ? `${displayName}'s workspace` : "My workspace";

    const user = await this.prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: { email, passwordHash, displayName, avatarColor: avatarColorForEmail(email) },
      });
      const workspace = await transaction.workspace.create({
        data: {
          name: workspaceName,
          slug: `workspace-${createdUser.id}`,
          ownerId: createdUser.id,
          members: { create: { userId: createdUser.id, role: "OWNER" } },
        },
      });
      await transaction.session.create({
        data: {
          userId: createdUser.id,
          tokenHash,
          expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        },
      });
      await transaction.auditLog.create({ data: { workspaceId: workspace.id, actorId: createdUser.id, action: "auth.registered", targetType: "user", targetId: createdUser.id } });
      return { ...createdUser, workspaceId: workspace.id };
    });

    return { token, user: this.toAuthenticatedUser(user) };
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    }

    const token = this.createSessionToken();
    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: this.hashSessionToken(token),
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });
    await this.prisma.auditLog.create({ data: { actorId: user.id, action: "auth.logged_in", targetType: "user", targetId: user.id } });
    return { token, user: this.toAuthenticatedUser(user) };
  }

  async loginWithIdentity(identity: ExternalIdentity): Promise<AuthSession> {
    const email = identity.email.trim().toLowerCase();
    const displayName = identity.displayName?.trim() || null;
    const token = this.createSessionToken();
    const tokenHash = this.hashSessionToken(token);

    const user = await this.prisma.$transaction(async (transaction) => {
      const existingIdentity = await transaction.authIdentity.findUnique({
        where: { provider_providerAccountId: { provider: identity.provider, providerAccountId: identity.providerAccountId } },
        include: { user: true },
      });
      if (existingIdentity) {
        await transaction.authIdentity.update({ where: { id: existingIdentity.id }, data: { email } });
        await transaction.session.create({ data: { userId: existingIdentity.userId, tokenHash, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) } });
        await transaction.auditLog.create({ data: { actorId: existingIdentity.userId, action: "auth.identity_logged_in", targetType: "user", targetId: existingIdentity.userId, metadata: { provider: identity.provider } } });
        return existingIdentity.user;
      }

      const existingUser = await transaction.user.findUnique({ where: { email } });
      const user = existingUser ?? await transaction.user.create({ data: { email, passwordHash: null, displayName, avatarColor: avatarColorForEmail(email) } });
      await transaction.authIdentity.create({ data: { userId: user.id, provider: identity.provider, providerAccountId: identity.providerAccountId, email } });
      if (!existingUser) {
        const workspaceName = displayName ? `${displayName}'s workspace` : "My workspace";
        const workspace = await transaction.workspace.create({
          data: { name: workspaceName, slug: `workspace-${user.id}`, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } } },
        });
        await transaction.auditLog.create({ data: { workspaceId: workspace.id, actorId: user.id, action: "auth.identity_registered", targetType: "user", targetId: user.id, metadata: { provider: identity.provider } } });
      } else {
        await transaction.auditLog.create({ data: { actorId: user.id, action: "auth.identity_linked", targetType: "user", targetId: user.id, metadata: { provider: identity.provider } } });
      }
      await transaction.session.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) } });
      return user;
    });

    return { token, user: this.toAuthenticatedUser(user) };
  }

  async linkIdentity(userId: string, provider: AuthIdentityProvider, providerAccountId: string): Promise<IdentitySummary> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.authIdentity.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } } });
      if (existing && existing.userId !== userId) throw new ConflictException({ code: "IDENTITY_ALREADY_LINKED", message: "This external identity is already linked to another account." });
      const identity = existing ?? await transaction.authIdentity.create({ data: { userId, provider, providerAccountId } });
      await transaction.auditLog.create({ data: { actorId: userId, action: existing ? "auth.identity_reconnected" : "auth.identity_linked", targetType: "identity", targetId: identity.id, metadata: { provider } } });
      return { provider: identity.provider, providerAccountId: identity.providerAccountId, updatedAt: identity.updatedAt };
    });
  }

  async listIdentities(userId: string): Promise<IdentitySummary[]> {
    return this.prisma.authIdentity.findMany({ where: { userId }, select: { provider: true, providerAccountId: true, updatedAt: true }, orderBy: { createdAt: "asc" } });
  }

  async unlinkIdentity(userId: string, provider: AuthIdentityProvider): Promise<IdentitySummary[]> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        include: { identities: { select: { provider: true } } },
      });
      if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User was not found." });
      const identity = await transaction.authIdentity.findFirst({ where: { userId, provider } });
      if (!identity) throw new NotFoundException({ code: "IDENTITY_NOT_FOUND", message: "This identity is not linked to your account." });
      const signInProviders = user.identities.filter((item) => item.provider === AuthIdentityProvider.GOOGLE || item.provider === AuthIdentityProvider.GITHUB);
      if ((provider === AuthIdentityProvider.GOOGLE || provider === AuthIdentityProvider.GITHUB) && !user.passwordHash && signInProviders.length <= 1) {
        throw new BadRequestException({ code: "LAST_SIGN_IN_METHOD", message: "Add a password or another sign-in method before removing your only sign-in identity." });
      }
      await transaction.authIdentity.delete({ where: { id: identity.id } });
      await transaction.auditLog.create({ data: { actorId: userId, action: "auth.identity_unlinked", targetType: "identity", targetId: identity.id, metadata: { provider } } });
    });
    return this.listIdentities(userId);
  }

  async getCurrentUser(token: string | undefined): Promise<AuthenticatedUser> {
    if (!token) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sign in is required." });
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashSessionToken(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Your session has expired." });
    }
    return this.toAuthenticatedUser(session.user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  static getSessionDurationMs() {
    return SESSION_DURATION_MS;
  }

  private createSessionToken() {
    return randomBytes(32).toString("base64url");
  }

  private hashSessionToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private toAuthenticatedUser(user: { id: string; email: string; displayName: string | null; avatarColor?: string | null }): AuthenticatedUser {
    return { id: user.id, email: user.email, displayName: user.displayName, avatarColor: isAvatarColor(user.avatarColor) ? user.avatarColor : "lime" };
  }
}

function avatarColorForEmail(email: string) {
  let hash = 0;
  for (const character of email) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function isAvatarColor(value: string | null | undefined): value is (typeof AVATAR_COLORS)[number] {
  return typeof value === "string" && AVATAR_COLORS.includes(value as (typeof AVATAR_COLORS)[number]);
}
