import { Prisma, ProviderWebhookState } from "@prisma/client";

// All updates compare both operation ID and prior state. A stale request cannot
// complete a newer operation. Callers must authorize the endpoint and validate
// its immutable published configuration before beginning a provider operation.
type RegistrationTable = {
  updateMany(args: { where: Prisma.ProviderWebhookRegistrationWhereInput; data: Prisma.ProviderWebhookRegistrationUpdateManyMutationInput }): Promise<{ count: number }>;
};

export class ProviderWebhookStateStore {
  constructor(private readonly registrations: RegistrationTable) {}

  async beginCreate(id: string, operationId: string): Promise<boolean> {
    return this.update({ id, operationId, state: ProviderWebhookState.CREATING }, { state: ProviderWebhookState.CREATE_DISPATCHING });
  }

  async finishCreate(id: string, operationId: string, outcome: { kind: "created"; hookId: number } | { kind: "rejected" | "uncertain" }): Promise<boolean> {
    if (outcome.kind === "created" && (!Number.isSafeInteger(outcome.hookId) || outcome.hookId <= 0)) throw new Error("Invalid provider hook ID");
    const state = outcome.kind === "created" ? ProviderWebhookState.ACTIVE : outcome.kind === "rejected" ? ProviderWebhookState.CREATE_REJECTED : ProviderWebhookState.CREATE_UNCERTAIN;
    const data: Prisma.ProviderWebhookRegistrationUpdateManyMutationInput = { state, ...(outcome.kind === "created" ? { remoteHookId: BigInt(outcome.hookId) } : {}) };
    return this.update({ id, operationId, state: ProviderWebhookState.CREATE_DISPATCHING }, data);
  }

  async beginDelete(id: string, previousOperationId: string, operationId: string): Promise<boolean> {
    if (!operationId || operationId === previousOperationId) throw new Error("A new operation ID is required");
    return this.update({ id, operationId: previousOperationId, state: ProviderWebhookState.ACTIVE, remoteHookId: { not: null } }, { operationId, state: ProviderWebhookState.DELETING });
  }

  async finishDelete(id: string, operationId: string, outcome: "removed" | "rejected" | "uncertain"): Promise<boolean> {
    const state = outcome === "removed" ? ProviderWebhookState.REMOVED : outcome === "rejected" ? ProviderWebhookState.ACTIVE : ProviderWebhookState.DELETE_UNCERTAIN;
    return this.update({ id, operationId, state: ProviderWebhookState.DELETING }, { state });
  }

  async recoverExpired(id: string, operationId: string, operation: "create" | "delete", expiredBefore: Date): Promise<boolean> {
    if (!Number.isFinite(expiredBefore.getTime())) throw new Error("A valid expiry time is required");
    const state = operation === "create" ? ProviderWebhookState.CREATE_DISPATCHING : ProviderWebhookState.DELETING;
    const uncertain = operation === "create" ? ProviderWebhookState.CREATE_UNCERTAIN : ProviderWebhookState.DELETE_UNCERTAIN;
    return this.update({ id, operationId, state, updatedAt: { lt: expiredBefore } }, { state: uncertain });
  }

  private async update(where: Prisma.ProviderWebhookRegistrationWhereInput, data: Prisma.ProviderWebhookRegistrationUpdateManyMutationInput): Promise<boolean> {
    return (await this.registrations.updateMany({ where, data })).count === 1;
  }
}
