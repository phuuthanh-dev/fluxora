import { BadRequestException, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { WorkflowService } from "./workflow.service";

@Controller()
@UseGuards(AuthenticationGuard)
export class WorkflowController {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}

  @Get("workspaces/:workspaceId/workflows")
  async list(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { workflows: await this.workflows.list(workspaceId, requireUserId(request)) };
  }

  @Get("workflow-templates")
  async listTemplates() {
    return { templates: this.workflows.listTemplates() };
  }

  @Post("workspaces/:workspaceId/workflows")
  async create(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.create(workspaceId, requireUserId(request), readCreateInput(request.body)) };
  }

  @Post("workspaces/:workspaceId/workflows/from-template/:slug")
  async createFromTemplate(@Param("workspaceId") workspaceId: string, @Param("slug") slug: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.createFromTemplate(workspaceId, requireUserId(request), slug) };
  }

  @Get("workflows/:workflowId")
  async get(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.get(workflowId, requireUserId(request)) };
  }

  @Get("workflows/:workflowId/versions")
  async listVersions(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { versions: await this.workflows.listVersions(workflowId, requireUserId(request)) };
  }

  @Patch("workflows/:workflowId/draft")
  async updateDraft(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.updateDraft(workflowId, requireUserId(request), readUpdateInput(request.body)) };
  }

  @Post("workflows/:workflowId/publish")
  async publish(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.publish(workflowId, requireUserId(request)) };
  }

  @Post("workflows/:workflowId/clone")
  async clone(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.clone(workflowId, requireUserId(request)) };
  }

  @Patch("workflows/:workflowId")
  async rename(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.rename(workflowId, requireUserId(request), readRenameInput(request.body)) };
  }

  @Post("workflows/:workflowId/archive")
  async archive(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { workflow: await this.workflows.archive(workflowId, requireUserId(request)) };
  }

  @Delete("workflows/:workflowId")
  async delete(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return await this.workflows.delete(workflowId, requireUserId(request));
  }
}

function requireUserId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}

function readCreateInput(value: unknown) {
  const record = readRecord(value);
  return { name: readText(record.name, "Workflow name", 1, 120), description: optionalText(record.description, "Workflow description", 500), graph: record.graph };
}

function readUpdateInput(value: unknown) {
  const record = readRecord(value);
  if (!("graph" in record)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Workflow graph is required." });
  return { name: record.name === undefined ? undefined : readText(record.name, "Workflow name", 1, 120), description: record.description === undefined ? undefined : record.description === null ? null : optionalText(record.description, "Workflow description", 500) ?? null, graph: record.graph };
}

function readRenameInput(value: unknown) {
  const record = readRecord(value);
  return readText(record.name, "Workflow name", 1, 120);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: "A JSON object is required." });
  }
  return value as Record<string, unknown>;
}

function readText(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: `${label} must be between ${minimum} and ${maximum} characters.` });
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maximum: number) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length > maximum) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: `${label} must be at most ${maximum} characters.` });
  }
  return value.trim() || undefined;
}
