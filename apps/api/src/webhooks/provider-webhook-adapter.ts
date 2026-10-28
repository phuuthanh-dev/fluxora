/** Provider-side registration only. Endpoint persistence and activation are owned by the caller. */
export type ProviderWebhookIdentity = { repository: string; hookId: number };
export type ProviderWebhookSpec = { repository: string; url: string; event: string; secret: string };
export type ProviderWebhookInspection = { urlMatches: boolean; eventsMatch: boolean; active: boolean };

export interface ProviderWebhookAdapter {
  create(token: string, spec: ProviderWebhookSpec): Promise<ProviderWebhookIdentity>;
  exists(token: string, identity: ProviderWebhookIdentity): Promise<boolean>;
  inspect(token: string, identity: ProviderWebhookIdentity, expected: { url: string; event: string }): Promise<ProviderWebhookInspection>;
  remove(token: string, identity: ProviderWebhookIdentity): Promise<void>;
}

/** Unknown means the remote write may have succeeded; callers must reconcile before retrying. */
export class ProviderWebhookError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "OUTCOME_UNKNOWN", readonly retryable: boolean) {
    super(`Provider webhook operation failed: ${code}`);
  }
}
