import { createSecretKey } from "node:crypto";

export function validateEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return;
  requireHttpsUrl(environment.WEB_ORIGIN, "WEB_ORIGIN");
  requireEncryptionKey(environment.APP_ENCRYPTION_KEY);
  requireCompleteOAuthConfig(environment, "GOOGLE");
  requireCompleteOAuthConfig(environment, "GITHUB");
  requireAllOrNone(environment, ["STEAM_OPENID_RETURN_URI", "STEAM_OPENID_REALM"]);
}

function requireHttpsUrl(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} must be configured in production.`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS in production.`);
}

function requireEncryptionKey(value: string | undefined) {
  if (!value) throw new Error("APP_ENCRYPTION_KEY must be configured in production.");
  try {
    if (createSecretKey(Buffer.from(value, "base64")).symmetricKeySize !== 32) throw new Error();
  } catch {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
}

function requireCompleteOAuthConfig(environment: NodeJS.ProcessEnv, prefix: "GOOGLE" | "GITHUB") {
  requireAllOrNone(environment, [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`, `${prefix}_AUTH_REDIRECT_URI`]);
}

function requireAllOrNone(environment: NodeJS.ProcessEnv, names: string[]) {
  const values = names.map((name) => environment[name]);
  if (values.some(Boolean) && values.some((value) => !value)) throw new Error(`${names.join(", ")} must be configured together.`);
}
