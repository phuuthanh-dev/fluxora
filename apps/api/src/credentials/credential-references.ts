import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** The node graph stores connection IDs in JSON rather than foreign keys. */
export function graphCredentialIds(graph: unknown): string[] {
  if (!graph || typeof graph !== "object" || !("nodes" in graph) || !Array.isArray(graph.nodes)) return [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : undefined;
    const rawConfig = record.config ?? data?.config;
    if (!rawConfig || typeof rawConfig !== "object") continue;
    const config = rawConfig as Record<string, unknown>;
    for (const key of ["credentialId", "notificationCredentialId"]) {
      const value = config[key];
      if (typeof value === "string" && value.trim()) ids.add(value);
    }
  }
  return [...ids].sort();
}

/** Keep referenced rows alive until a graph or execution is committed. */
export async function lockGraphCredentials(tx: Prisma.TransactionClient, workspaceId: string, graph: unknown): Promise<void> {
  const ids = graphCredentialIds(graph);
  if (!ids.length) return;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Credential" WHERE "workspaceId" = ${workspaceId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`;
  if (rows.length !== ids.length) throw new ConflictException({ code: "CREDENTIAL_REFERENCE_NOT_FOUND", message: "A selected connection is unavailable. Choose an existing connection before saving or running this workflow." });
}
