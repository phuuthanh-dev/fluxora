import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";

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

  private async nextSlug(name: string) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
    const candidate = `${base}-${randomUUID().slice(0, 8)}`;
    return candidate;
  }
}
