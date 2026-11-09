import { BadRequestException } from "@nestjs/common";

export type AdminScope = { userId?: string; workspaceId?: string; workflowId?: string; executionId?: string };
export type AuditFilters = { actor?: string; actorId?: string; targetType?: string; targetId?: string; from?: string; to?: string; workspaceId?: string };

export function adminId(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) invalid();
  return value;
}

export function auditFilters(filters: AuditFilters) {
  const actorId = adminId(filters.actorId), targetId = adminId(filters.targetId), workspaceId = adminId(filters.workspaceId);
  for (const value of [filters.actor, filters.targetType]) if (value !== undefined && (typeof value !== "string" || value.length > 80)) invalid();
  const from = calendarDate(filters.from), to = calendarDate(filters.to);
  if (from && to && from > to) invalid();
  return {
    ...(actorId ? { actorId } : {}),
    ...(filters.actor?.trim() ? { actor: { email: { contains: filters.actor.trim(), mode: "insensitive" as const } } } : {}),
    ...(targetId ? { targetId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(filters.targetType?.trim() ? { targetType: filters.targetType.trim() } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
  };
}

function calendarDate(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid();
  return date;
}

function invalid(): never {
  throw new BadRequestException({ code: "INVALID_INPUT", message: "Use valid filters and a start date no later than the end date. Dates use UTC." });
}
