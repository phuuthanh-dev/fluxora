import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const keyPattern = /^[A-Z][A-Z0-9_]*$/;
const placeholderPattern = /^(?:replace-with|base64-encoded|change[-_ ]?me|your[-_ ]|todo(?:$|[-_ ]))/i;

export function parseProductionEnv(text) {
  const values = new Map();
  const errors = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      errors.push(`line ${index + 1}: invalid assignment`);
      return;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!keyPattern.test(key)) errors.push(`line ${index + 1}: invalid variable name`);
    if (values.has(key)) errors.push(`${key}: duplicate variable`);
    values.set(key, value);
  });
  return { values, errors };
}

function required(values, key, errors) {
  if (!values.get(key)) errors.push(`${key}: required`);
}

function validOrigin(value, key, errors) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") errors.push(`${key}: must be an HTTPS origin`);
  } catch {
    errors.push(`${key}: invalid URL`);
  }
}

function validApiUrl(value, key, errors) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/v1") errors.push(`${key}: must be an HTTPS API URL ending in /api/v1`);
  } catch {
    errors.push(`${key}: invalid URL`);
  }
}

function validateProviderGroup(values, keys, errors) {
  const present = keys.map((key) => Boolean(values.get(key)));
  if (present.some(Boolean) && !present.every(Boolean)) errors.push(`${keys.join(", ")}: provider group must be complete or empty`);
}

export function validateProductionEnv(text) {
  const parsed = parseProductionEnv(text);
  const values = parsed.values;
  const errors = [...parsed.errors];
  const requiredKeys = [
    "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "IMAGE_TAG", "API_IMAGE", "WEB_IMAGE",
    "NEXT_PUBLIC_API_URL", "WEB_ORIGIN", "NODE_ENV", "EXECUTION_QUEUE_MODE", "EXECUTION_QUEUE_NAME",
    "EXECUTION_EVENTS_CHANNEL", "EXECUTION_WORKER_CONCURRENCY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "APP_ENCRYPTION_KEY",
  ];
  for (const key of requiredKeys) required(values, key, errors);
  for (const [key, value] of values) {
    if (value && placeholderPattern.test(value)) errors.push(`${key}: placeholder value`);
  }
  if (values.get("NODE_ENV") !== "production") errors.push("NODE_ENV: must be production");
  if (values.get("EXECUTION_QUEUE_MODE") !== "redis") errors.push("EXECUTION_QUEUE_MODE: must be redis");
  if (values.get("IMAGE_TAG") && !/^[0-9a-f]{40}$/.test(values.get("IMAGE_TAG"))) errors.push("IMAGE_TAG: must be a 40-character lowercase commit SHA");
  if (values.get("API_IMAGE") && !/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(values.get("API_IMAGE"))) errors.push("API_IMAGE: unexpected registry shape");
  if (values.get("WEB_IMAGE") && !/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(values.get("WEB_IMAGE"))) errors.push("WEB_IMAGE: unexpected registry shape");
  if (values.get("WEB_ORIGIN")) validOrigin(values.get("WEB_ORIGIN"), "WEB_ORIGIN", errors);
  if (values.get("NEXT_PUBLIC_API_URL")) validApiUrl(values.get("NEXT_PUBLIC_API_URL"), "NEXT_PUBLIC_API_URL", errors);
  if (values.get("EXECUTION_WORKER_CONCURRENCY") && !/^(?:[1-9]|1[0-9]|20)$/.test(values.get("EXECUTION_WORKER_CONCURRENCY"))) errors.push("EXECUTION_WORKER_CONCURRENCY: must be 1–20");
  if (values.get("APP_ENCRYPTION_KEY")) {
    try {
      if (Buffer.from(values.get("APP_ENCRYPTION_KEY"), "base64").length !== 32) errors.push("APP_ENCRYPTION_KEY: must decode to 32 bytes");
    } catch {
      errors.push("APP_ENCRYPTION_KEY: invalid base64");
    }
  }
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) if (values.get(key)?.length < 32) errors.push(`${key}: must be at least 32 characters`);
  validateProviderGroup(values, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], errors);
  validateProviderGroup(values, ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"], errors);
  for (const key of ["GOOGLE_REDIRECT_URI", "GOOGLE_AUTH_REDIRECT_URI", "GITHUB_AUTH_REDIRECT_URI", "STEAM_OPENID_RETURN_URI", "STEAM_OPENID_REALM"]) {
    if (!values.get(key)) errors.push(`${key}: required callback/realm URL`);
    else {
      try {
        const url = new URL(values.get(key));
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) errors.push(`${key}: must be HTTPS without credentials/query/fragment`);
      } catch {
        errors.push(`${key}: invalid URL`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = argument("--env-file");
  if (!path) {
    console.error("Usage: node scripts/validate-production-env.mjs --env-file <path>");
    process.exitCode = 1;
  } else {
    const result = validateProductionEnv(readFileSync(resolve(path), "utf8"));
    if (!result.valid) {
      console.error(`Production environment validation failed with ${result.errors.length} contract issue(s):`);
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log("Production environment contract passed; secret values were not printed.");
    }
  }
}
