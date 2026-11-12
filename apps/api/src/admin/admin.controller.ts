import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters, UseGuards, BadRequestException, NotFoundException } from "@nestjs/common";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AccountRequestGuard } from "../auth/account-request.guard";
import { AccountExceptionFilter } from "../auth/account.controller";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { RuntimeHealthService } from "../platform/runtime-health.service";
import { AdminGuard } from "./admin.guard";
import { adminId, auditFilters, type AdminScope, type AuditFilters } from "./admin-query";
import { JiraPrivacyService } from "./jira-privacy.service";
import { effectivePlan } from "@workflow/contracts";

@Controller("admin")
@UseGuards(AccountRequestGuard, AuthenticationGuard, AdminGuard)
@UseFilters(AccountExceptionFilter)
export class AdminController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(RuntimeHealthService) private readonly health: RuntimeHealthService, @Inject(JiraPrivacyService) private readonly jiraPrivacy: JiraPrivacyService) {}

  @Get("access")
  @Header("Cache-Control", "no-store")
  access(@Req() request: AuthenticatedRequest) { return { allowed: true, userId: request.currentUser!.id }; }

  @Get("jira-privacy-reporting")
  @Header("Cache-Control", "no-store")
  async jiraPrivacyReporting() {
    const accounts = await this.prisma.jiraPrivacyAccount.groupBy({ by: ["state", "requiredAction"], _count: { _all: true } });
    return { enabled: process.env.JIRA_PRIVACY_REPORTING_ENABLED === "true", accounts: accounts.map((item) => ({ state: item.state, requiredAction: item.requiredAction, count: item._count._all })) };
  }

  @Get("jira-privacy-reporting/records")
  @Header("Cache-Control", "no-store")
  jiraPrivacyRecords(@Query("cursor") cursor?: string) { return this.jiraPrivacy.list(cursor); }

  @Post("jira-privacy-reporting/discover")
  @Header("Cache-Control", "no-store")
  jiraPrivacyDiscover(@Req() request: AuthenticatedRequest) { return this.jiraPrivacy.discover(request.currentUser!.id); }

  @Get("jira-privacy-reporting/:id/preview")
  @Header("Cache-Control", "no-store")
  jiraPrivacyPreview(@Param("id") id: string, @Req() request: AuthenticatedRequest) { return this.jiraPrivacy.preview(id, request.currentUser!.id); }

  @Post("jira-privacy-reporting/:id/resolve")
  @Header("Cache-Control", "no-store")
  jiraPrivacyResolve(@Param("id") id: string, @Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.jiraPrivacy.resolve(id, request.currentUser!.id, body ?? {}); }

  @Post("jira-privacy-reporting/:id/recover")
  @Header("Cache-Control", "no-store")
  jiraPrivacyRecover(@Param("id") id: string, @Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.jiraPrivacy.recover(id, request.currentUser!.id, body ?? {}); }

  @Get("overview")
  @Header("Cache-Control", "no-store")
  async overview() {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [users, workspaces, workflows, activeWorkflows, failedRuns, retainedLiveRuns, health] = await Promise.all([
      this.prisma.user.count(), this.prisma.workspace.count(), this.prisma.workflow.count(),
      this.prisma.workflow.count({ where: { isActive: true, archivedAt: null } }),
      this.prisma.execution.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      this.prisma.execution.count({ where: { mode: "LIVE", startedAt: { gte: periodStart, lte: now } } }), this.health.readiness(),
    ]);
    return { users, workspaces, workflows, activeWorkflows, failedRuns, retainedLiveRuns, failedRunsPeriod: "24h", health };
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
    const workspaces = await this.prisma.workspace.findMany({ take: 51, skip, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], where: { ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(adminId(scope.userId) ? { ownerId: scope.userId } : {}), ...(adminId(scope.workspaceId) ? { id: scope.workspaceId } : {}) }, select: { id: true, name: true, updatedAt: true, trialPlan: true, trialExpiresAt: true, paidPlan: true, paidUntil: true, owner: { select: { id: true, email: true } }, _count: { select: { workflows: true } } } });
    return { workspaces: workspaces.slice(0, 50).map((space) => ({ ...space, effectivePlan: effectivePlan(space.paidPlan, space.paidUntil) !== "FREE" ? effectivePlan(space.paidPlan, space.paidUntil) : effectivePlan(space.trialPlan, space.trialExpiresAt) })), hasMore: workspaces.length > 50 };
  }

  @Post("workspaces/:workspaceId/trial-plan")
  @Header("Cache-Control", "no-store")
  async setTrialPlan(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const value = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (!adminId(workspaceId) || !["FREE", "STARTER", "PRO"].includes(String(value.plan)) || (value.plan !== "FREE" && ![7, 14, 30].includes(Number(value.days))) || (value.plan !== "FREE" && typeof value.days !== "number")) {
      throw new BadRequestException({ code: "INVALID_INPUT", message: "Choose a valid trial plan and duration." });
    }
    const plan = value.plan as "FREE" | "STARTER" | "PRO";
    const expiresAt = plan === "FREE" ? null : new Date(Date.now() + Number(value.days) * 86400000);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, trialPlan: true, trialExpiresAt: true } });
      if (!workspace) throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
      await tx.workspace.update({ where: { id: workspaceId }, data: { trialPlan: plan === "FREE" ? null : plan, trialExpiresAt: expiresAt } });
      await tx.auditLog.create({ data: { actorId: request.currentUser!.id, workspaceId, action: "admin.trial_plan_changed", targetType: "workspace", targetId: workspaceId, metadata: { previousPlan: effectivePlan(workspace.trialPlan, workspace.trialExpiresAt), plan, expiresAt: expiresAt?.toISOString() ?? null } } });
      return { plan, expiresAt };
    });
  }

  @Get("workspaces/:workspaceId/plan-usage")
  @Header("Cache-Control", "no-store")
  async workspacePlanUsage(@Param("workspaceId") workspaceId: string) {
    if (!adminId(workspaceId)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Use a valid workspace." });
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const [retainedRuns, activeWorkflows] = await Promise.all([
      this.prisma.execution.count({ where: { mode: "LIVE", startedAt: { gte: start, lt: end }, workflowVersion: { workflow: { workspaceId } } } }),
      this.prisma.workflow.count({ where: { workspaceId, isActive: true, archivedAt: null } }),
    ]);
    return { retainedRuns, activeWorkflows, periodStart: start, periodEnd: end };
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
