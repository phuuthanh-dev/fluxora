import { NodeFailure } from "./node-failure";

/** Reject provider-supplied fields that would expose the current credential.
 * Check before truncating: otherwise a secret crossing the display boundary
 * could leave part of it in a persisted value or resource selector. */
export function assertNoCredentialInProviderFields(fields: readonly unknown[], credential: string): void {
  if (credential && fields.some((field) => typeof field === "string" && field.includes(credential))) {
    throw new NodeFailure("INVALID_RESPONSE", "The provider returned content that cannot be displayed or stored safely.", false);
  }
}
