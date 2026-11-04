import { NodeFailure } from "./node-failure";

export function readCredentialId(config: Record<string, unknown>) {
  const id = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!id) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a credential for this node.", false);
  return id;
}

export function readCredentialValue(credential: Record<string, unknown>, key: string) {
  const value = credential[key];
  if (typeof value !== "string" || !value) throw new NodeFailure("CREDENTIAL_INVALID", `Credential is missing ${key}.`, false);
  return value;
}
