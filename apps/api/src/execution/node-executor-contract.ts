import type { WorkflowEdgeKind } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import type { NodeFailure } from "./node-failure";

export type RunMode = "mock" | "live";
export type NodeResult = { status: "succeeded" | "failed" | "waiting" | "interrupted"; output: Record<string, unknown>; route?: WorkflowEdgeKind; error?: NodeFailure };
export type ConnectorExecutorInput = { config: Record<string, unknown>; mode: RunMode; workspaceId: string; credentials: CredentialService; executionId: string; nodeId: string };
export type ConnectorExecutor = (input: ConnectorExecutorInput) => Promise<NodeResult>;
