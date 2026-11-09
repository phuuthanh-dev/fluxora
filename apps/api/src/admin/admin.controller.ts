import { Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters, UseGuards, BadRequestException, NotFoundException } from "@nestjs/common";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AccountRequestGuard } from "../auth/account-request.guard";
import { AccountExceptionFilter } from "../auth/account.controller";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { RuntimeHealthService } from "../platform/runtime-health.service";
import { AdminGuard } from "./admin.guard";
import { adminId, auditFilters, type AdminScope, type AuditFilters } from "./admin-query";

@Controller("admin")
@UseGuards(AccountRequestGuard, AuthenticationGuard, AdminGuard)
@UseFilters(AccountExceptionFilter)
export class AdminController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(RuntimeHealthService) private readonly health: RuntimeHealthService) {}

  @Get("access")
  @Header("Cache-Control", "no-store")
  access(@Req() request: AuthenticatedRequest) { return { allowed: true, userId: request.currentUser!.id }; }

  @Get("overview")
  @Header("Cache-Control", "no-store")
  async overview() {
    const [users, workspaces, workflows, activeWorkflows, failedRuns, health] = await Promise.all([
      this.prisma.user.count(), this.prisma.workspace.count(), this.prisma.workflow.count(),
      this.prisma.workflow.count({ where: { isActive: true, archivedAt: null } }),
      this.prisma.execution.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 86400000) } } }), this.health.readiness(),
    ]);
    return { users, workspaces, workflows, activeWorkflows, failedRuns, failedRunsPeriod: "24h", health };
  }

  @Get("users")
  @Header("Cache-Control", "no-store")
  async users(@Query("q") query?: string, @Query("page") page?: string, @Query("userId") userId?: string) {
    const { q, skip } = listOptions(query, page);
    const users = await this.prisma.user.findMany({ take: 51, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }], where: { ...(adminId(userId) ? { id: userId } : {}), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { displayName: { contains: q, mode: "insensitive" as const } }] } : {}) }, select: { id: true, email: true, displayName: true, createdAt: true, disabledAt: true, _count: { select: { ownedWorkspaces: true } } } });
    return { users: users.slice(0, 50), hasMore: users.length > 50 };
  }

  @Get("workspaces")
  @Header("Cache-Control", "no-store")
  async workspaces(@Query("q") query?: string, @Query("page") page?: string, @Query() scope: AdminScope = {}) {
    const { q, skip } = listOptions(query, page);
    const workspaces = await this.prisma.workspace.findMany({ take: 51, skip, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], where: { ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(adminId(scope.userId) ? { ownerId: scope.userId } : {}), ...(adminId(scope.workspaceId) ? { id: scope.workspaceId } : {}) }, select: { id: true, name: true, updatedAt: true, owner: { select: { id: true, email: true } }, _count: { select: { workflows: true } } } });
    return { workspaces: workspaces.slice(0, 50), hasMore: workspaces.length > 50 };
  }

  @Get("workflows")
  @Header("Cache-Control", "no-store")
  async workflows(@Query("q") query?: string, @Query("page") page?: string, @Query() scope: AdminScope = {}) {
    const { q, skip } = listOptions(query, page);
    const workflows = await this.prisma.workflow.findMany({ take: 51, skip, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], where: { ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(adminId(scope.workspaceId) ? { workspaceId: scope.workspaceId } : {}), ...(adminId(scope.workflowId) ? { id: scope.workflowId } : {}) }, select: { id: true, name: true, isActive: true, archivedAt: true, updatedAt: true, workspace: { select: { id: true, name: true } } } });
    return { workflows: workflows.slice(0, 50), hasMore: workflows.length > 50 };
  }

  @Get("executions")
  @Header("Cache-Control", "no-store")
  async executions(@Query("q") query?: string, @Query("page") page?: string, @Query("status") status?: string, @Query("period") period?: string, @Query() scope: AdminScope = {}) {
    const { q, skip } = listOptions(query, page);
    const statuses = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
    const selectedStatus = statuses.find((value) => value === status);
    if (status && !selectedStatus || period && !["24h", "7d", "30d", "all"].includes(period)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Select a valid execution status and period." });
    const workflowId = adminId(scope.workflowId);
    const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : null;
    const executions = await this.prisma.execution.findMany({ take: 51, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }], where: { ...(adminId(scope.executionId) ? { id: scope.executionId } : {}), ...((q || workflowId) ? { workflowVersion: { workflow: { ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(workflowId ? { id: workflowId } : {}) } } } : {}), ...(selectedStatus ? { status: selectedStatus } : {}), ...(days ? { createdAt: { gte: new Date(Date.now() - days * 86400000) } } : {}) }, select: { id: true, status: true, mode: true, createdAt: true, startedAt: true, completedAt: true, errorCode: true, workflowVersion: { select: { version: true, workflow: { select: { id: true, name: true, workspace: { select: { id: true, name: true } } } } } } } });
    return { executions: executions.slice(0, 50), hasMore: executions.length > 50 };
  }

  @Get("audit")
  @Header("Cache-Control", "no-store")
  async audit(@Query("q") query?: string, @Query("page") page?: string, @Query() filters: AuditFilters = {}) {
    const { q, skip } = listOptions(query, page);
    const events = await this.prisma.auditLog.findMany({ take: 51, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }], where: { ...auditFilters(filters), ...(q ? { action: { contains: q, mode: "insensitive" as const } } : {}) }, select: { id: true, action: true, targetType: true, targetId: true, workspaceId: true, createdAt: true, actor: { select: { id: true, email: true } } } });
    return { events: events.slice(0, 50), hasMore: events.length > 50 };
  }

  @Post("users/:userId/revoke-sessions")
  @Header("Cache-Control", "no-store")
  async revokeSessions(@Param("userId") userId: string, @Req() request: AuthenticatedRequest) {
    const actorId = request.currentUser!.id;
    if (userId === actorId) throw new BadRequestException({ code: "ADMIN_SELF_ACTION", message: "Use account settings to manage your own sessions." });
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found." });
      const result = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId, action: "admin.sessions_revoked", targetType: "user", targetId: userId, metadata: { count: result.count } } });
      return { revoked: result.count };
    });
  }

  @Post("users/:userId/:operation")
  @Header("Cache-Control", "no-store")
  async setAccountState(@Param("userId") userId: string, @Param("operation") operation: string, @Req() request: AuthenticatedRequest) {
    const actorId = request.currentUser!.id;
    if (userId === actorId) throw new BadRequestException({ code: "ADMIN_SELF_ACTION", message: "You cannot change your own account state." });
    if (operation !== "disable" && operation !== "enable") throw new BadRequestException({ code: "INVALID_ACTION", message: "Unknown account action." });
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!users.length) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found." });
      const disabledAt = operation === "disable" ? new Date() : null;
      await tx.user.update({ where: { id: userId }, data: { disabledAt } });
      if (disabledAt) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: disabledAt } });
      await tx.auditLog.create({ data: { actorId, action: `admin.account_${operation}d`, targetType: "user", targetId: userId } });
      return { disabled: Boolean(disabledAt) };
    });
  }
}

function listOptions(query: unknown, page: unknown) {
  if ((query !== undefined && (typeof query !== "string" || query.length > 80)) || (page !== undefined && (typeof page !== "string" || !/^[1-9]\d{0,3}$/.test(page)))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Use a valid search and page." });
  return { q: typeof query === "string" ? query.trim() : "", skip: (page ? Number(page) - 1 : 0) * 50 };
}
