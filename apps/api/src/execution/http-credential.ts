export class HttpCredentialError extends Error {}

/** Exact credential material and the normal wire encodings used by this
 * adapter. This is a safeguard against echoes, not detection of every
 * possible encoding or partial disclosure. */
export function httpCredentialSecrets(credential: Record<string, unknown>): string[] {
  const authType = readText(credential.authType) ?? "headers";
  const secrets: string[] = [];
  const add = (value: unknown) => { if (typeof value === "string" && value) secrets.push(value); };
  if (authType === "bearer") add(credential.token);
  else if (authType === "apiKey") {
    add(credential.value);
    if (credential.location === "query" && typeof credential.value === "string" && credential.value) {
      try { add(encodeURIComponent(credential.value)); } catch { /* malformed Unicode is handled by the request */ }
      add(new URLSearchParams({ value: credential.value }).toString().slice("value=".length));
    }
  } else if (authType === "basic") {
    add(credential.password);
    if (typeof credential.username === "string" && typeof credential.password === "string" && credential.username && credential.password) {
      add(Buffer.from(`${credential.username}:${credential.password}`).toString("base64"));
    }
  } else if (authType === "headers" && credential.headers && typeof credential.headers === "object" && !Array.isArray(credential.headers)) {
    for (const [name, value] of Object.entries(credential.headers)) {
      add(value);
      if (name.toLowerCase() === "authorization" && typeof value === "string") {
        const bearer = /^Bearer\s+(.+)$/i.exec(value);
        if (bearer) add(bearer[1]);
      }
    }
  }
  return [...new Set(secrets)];
}

export function applyHttpCredential(rawUrl: string, headers: Record<string, string>, credential: Record<string, unknown>) {
  const authType = readText(credential.authType) ?? "headers";
  const nextHeaders = { ...headers };
  const url = new URL(rawUrl);
  if (authType === "bearer") {
    nextHeaders.Authorization = `Bearer ${required(credential, "token")}`;
  } else if (authType === "apiKey") {
    const name = readText(credential.name) ?? "X-API-Key";
    const value = required(credential, "value");
    if (credential.location === "query") url.searchParams.set(name, value);
    else nextHeaders[name] = value;
  } else if (authType === "basic") {
    nextHeaders.Authorization = `Basic ${Buffer.from(`${required(credential, "username")}:${required(credential, "password")}`).toString("base64")}`;
  } else if (authType === "headers") {
    const customHeaders = credential.headers;
    if (!customHeaders || typeof customHeaders !== "object" || Array.isArray(customHeaders)) throw new HttpCredentialError("HTTP header credentials need a headers object.");
    for (const [name, value] of Object.entries(customHeaders)) {
      if (typeof value !== "string") throw new HttpCredentialError("HTTP credential header values must be strings.");
      nextHeaders[name] = value;
    }
  } else {
    throw new HttpCredentialError("HTTP credential authType must be bearer, apiKey, basic, or headers.");
  }
  return { url: url.toString(), headers: nextHeaders };
}

function required(credential: Record<string, unknown>, key: string) {
  const value = readText(credential[key]);
  if (!value) throw new HttpCredentialError(`HTTP credential is missing ${key}.`);
  return value;
}

function readText(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
