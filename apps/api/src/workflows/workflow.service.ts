import type { WorkflowGraph } from "@workflow/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WorkflowVersionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";

type CreateWorkflowInput = { name: string; description?: string; graph?: unknown };
type UpdateDraftInput = { name?: string; description?: string | null; graph: unknown };

const defaultGraph: WorkflowGraph = {
  nodes: [{ id: "manual", type: "trigger.manual", position: { x: 120, y: 180 }, config: {} }],
  edges: [],
};

@Injectable()
export class WorkflowService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService) {}

  async list(workspaceId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const workflows = await this.prisma.workflow.findMany({
      where: { workspaceId },
      include: { draftVersion: true, publishedVersion: true },
      orderBy: { updatedAt: "desc" },
    });
    return workflows.map((workflow) => this.serialize(workflow));
  }

  listTemplates() {
    return systemWorkflowTemplates.map((template) => ({ slug: template.slug, name: template.name, description: template.description, graph: template.graph }));
  }

  async createFromTemplate(workspaceId: string, userId: string, slug: string) {
    const template = systemWorkflowTemplates.find((candidate) => candidate.slug === slug);
    if (!template) throw new NotFoundException({ code: "WORKFLOW_TEMPLATE_NOT_FOUND", message: "Workflow template was not found." });
    return this.create(workspaceId, userId, { name: template.name, description: template.description, graph: template.graph });
  }

  async create(workspaceId: string, userId: string, input: CreateWorkflowInput) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const graph = input.graph === undefined ? defaultGraph : parseWorkflowGraph(input.graph);
    const workflow = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.workflow.create({ data: { workspaceId, name: input.name, description: input.description ?? null } });
      const draft = await transaction.workflowVersion.create({
        data: { workflowId: created.id, version: 1, status: WorkflowVersionStatus.DRAFT, graph: graph as Prisma.InputJsonValue },
      });
      const linked = await transaction.workflow.update({
        where: { id: created.id },
        data: { draftVersionId: draft.id },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId, actorId: userId, action: "workflow.created", targetType: "workflow", targetId: created.id } });
      return linked;
    });
    return this.serialize(workflow);
  }

  async get(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    return this.serialize(workflow);
  }

  async updateDraft(workflowId: string, userId: string, input: UpdateDraftInput) {
    const workflow = await this.findOwned(workflowId, userId);
    const graph = parseWorkflowGraph(input.graph);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const draft = workflow.draftVersionId
        ? await transaction.workflowVersion.update({ where: { id: workflow.draftVersionId }, data: { graph: graph as Prisma.InputJsonValue } })
        : await transaction.workflowVersion.create({
          data: { workflowId, version: (await nextVersion(transaction, workflowId)), status: WorkflowVersionStatus.DRAFT, graph: graph as Prisma.InputJsonValue },
        });
      const linked = await transaction.workflow.update({
        where: { id: workflowId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          draftVersionId: draft.id,
        },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.draft_saved", targetType: "workflow", targetId: workflowId } });
      return linked;
    });
    return this.serialize(updated);
  }

  async publish(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.draftVersion) {
      throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "Workflow has no draft version to publish." });
    }
    const draftVersion = workflow.draftVersion;
    const graph = parseWorkflowGraph(draftVersion.graph);
    validatePublishableGraph(graph);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const published = await transaction.workflowVersion.update({
        where: { id: draftVersion.id },
        data: { status: WorkflowVersionStatus.PUBLISHED, publishedAt: new Date() },
      });
      const nextDraft = await transaction.workflowVersion.create({
        data: { workflowId, version: await nextVersion(transaction, workflowId), status: WorkflowVersionStatus.DRAFT, graph: graph as Prisma.InputJsonValue },
      });
      const linked = await transaction.workflow.update({
        where: { id: workflowId },
        data: { publishedVersionId: published.id, draftVersionId: nextDraft.id },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.published", targetType: "workflow", targetId: workflowId, metadata: { version: published.version } } });
      return linked;
    });
    return this.serialize(updated);
  }

  async clone(workflowId: string, userId: string) {
    const source = await this.findOwned(workflowId, userId);
    const sourceGraph = source.draftVersion?.graph ?? source.publishedVersion?.graph;
    if (!sourceGraph) throw new NotFoundException({ code: "WORKFLOW_VERSION_NOT_FOUND", message: "Workflow has no version to clone." });
    return this.create(source.workspaceId, userId, { name: `${source.name} copy`, description: source.description ?? undefined, graph: sourceGraph });
  }

  private async findOwned(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { draftVersion: true, publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    return workflow;
  }

  private serialize(workflow: { id: string; workspaceId: string; name: string; description: string | null; draftVersion: { id: string; version: number; status: WorkflowVersionStatus; graph: Prisma.JsonValue } | null; publishedVersion: { id: string; version: number; status: WorkflowVersionStatus; graph: Prisma.JsonValue } | null; createdAt: Date; updatedAt: Date }) {
    return {
      id: workflow.id,
      workspaceId: workflow.workspaceId,
      name: workflow.name,
      description: workflow.description,
      draft: workflow.draftVersion ? { id: workflow.draftVersion.id, version: workflow.draftVersion.version, graph: workflow.draftVersion.graph } : null,
      published: workflow.publishedVersion ? { id: workflow.publishedVersion.id, version: workflow.publishedVersion.version, graph: workflow.publishedVersion.graph } : null,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}

async function nextVersion(transaction: Prisma.TransactionClient, workflowId: string) {
  const latest = await transaction.workflowVersion.aggregate({ where: { workflowId }, _max: { version: true } });
  return (latest._max.version ?? 0) + 1;
}
