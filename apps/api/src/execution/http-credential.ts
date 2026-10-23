export class HttpCredentialError extends Error {}

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
