import { NodeFailure } from "./node-failure";

/** Reject provider-supplied fields that would expose the current credential.
 * Check before truncating: otherwise a secret crossing the display boundary
 * could leave part of it in a persisted value or resource selector. */
export function assertNoCredentialInProviderFields(fields: readonly unknown[], credential: string): void {
  if (credential && fields.some((field) => typeof field === "string" && field.includes(credential))) {
    throw new NodeFailure("INVALID_RESPONSE", "The provider returned content that cannot be displayed or stored safely.", false);
  }
}

/** Inspect JSON values and object keys without assuming which fields a provider returns. */
export function assertNoCredentialInProviderValue(value: unknown, credential: string): void {
  if (!credential) return;
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string") assertNoCredentialInProviderFields([item], credential);
    else if (Array.isArray(item)) { for (const entry of item) pending.push(entry); }
    else if (item && typeof item === "object") {
      for (const [key, entry] of Object.entries(item)) {
        assertNoCredentialInProviderFields([key], credential);
        pending.push(entry);
      }
    }
  }
}
