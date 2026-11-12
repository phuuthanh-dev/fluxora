import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { effectivePlan, planCatalog } from "@workflow/contracts";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
};

@Injectable()
export class WorkspaceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { workspace: { updatedAt: "desc" } },
    });
    return memberships.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, slug: workspace.slug, role }));
  }

  async createForOwner(userId: string, name: string): Promise<WorkspaceSummary> {
    const slug = await this.nextSlug(name);
    const workspace = await this.prisma.workspace.create({
      data: {
        name,
        slug,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    await this.prisma.auditLog.create({ data: { workspaceId: workspace.id, actorId: userId, action: "workspace.created", targetType: "workspace", targetId: workspace.id } });
    return { id: workspace.id, name: workspace.name, slug: workspace.slug, role: "OWNER" };
  }

  async requireOwner(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!membership || membership.role !== "OWNER") {
      throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
    }
    return membership.workspaceId;
  }

  async planUsage(workspaceId: string, userId: string, now = new Date()) {
    await this.requireOwner(workspaceId, userId);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const [workspace, retainedRuns, activeWorkflows, trackedRuns, meter] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { trialPlan: true, trialExpiresAt: true } }),
      this.prisma.execution.count({ where: { mode: "LIVE", startedAt: { gte: start, lt: end }, workflowVersion: { workflow: { workspaceId } } } }),
      this.prisma.workflow.count({ where: { workspaceId, isActive: true, archivedAt: null } }),
      this.prisma.usageRun.count({ where: { workspaceId, startedAt: { gte: start, lt: end } } }),
      this.prisma.usageMeter.findUniqueOrThrow({ where: { id: "primary" } }),
    ]);
    const plan = effectivePlan(workspace.trialPlan, workspace.trialExpiresAt, now);
    return { plan, trialExpiresAt: plan === "FREE" ? null : workspace.trialExpiresAt, periodStart: start, periodEnd: end, retainedRuns, trackedRuns, meteringSince: meter.startedAt, activeWorkflows, catalog: planCatalog };
  }

  private async nextSlug(name: string) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
    const candidate = `${base}-${randomUUID().slice(0, 8)}`;
    return candidate;
  }
}
