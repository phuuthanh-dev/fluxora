import { BadRequestException } from "@nestjs/common";

export type GitHubAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GitHubIdentity = {
  providerAccountId: string;
  email: string;
  displayName: string | null;
};

export function githubAuthConfig(environment: NodeJS.ProcessEnv = process.env): GitHubAuthConfig {
  const clientId = environment.GITHUB_CLIENT_ID;
  const clientSecret = environment.GITHUB_CLIENT_SECRET;
  const redirectUri = environment.GITHUB_AUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new BadRequestException({ code: "GITHUB_AUTH_NOT_CONFIGURED", message: "GitHub account sign-in is not configured yet." });
  }
  return { clientId, clientSecret, redirectUri };
}

export function createGitHubAuthorizationUrl(config: GitHubAuthConfig, state: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "read:user user:email",
    state,
  }).toString();
  return url.toString();
}

export async function fetchGitHubIdentity(code: string, config: GitHubAuthConfig): Promise<GitHubIdentity> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri }),
    signal: AbortSignal.timeout(20_000),
  });
  const token = await tokenResponse.json().catch(() => ({})) as { access_token?: unknown };
  if (!tokenResponse.ok || typeof token.access_token !== "string") {
    throw new BadRequestException({ code: "GITHUB_AUTH_TOKEN_FAILED", message: "GitHub did not return an access token." });
  }

  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}`, "User-Agent": "Fluxora" };
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers, signal: AbortSignal.timeout(20_000) }),
    fetch("https://api.github.com/user/emails", { headers, signal: AbortSignal.timeout(20_000) }),
  ]);
  const profile = await profileResponse.json().catch(() => ({})) as { id?: unknown; login?: unknown; name?: unknown };
  const emails = await emailsResponse.json().catch(() => []) as unknown;
  const email = primaryVerifiedEmail(emails);
  if (!profileResponse.ok || !emailsResponse.ok || typeof profile.id !== "number" || !email) {
    throw new BadRequestException({ code: "GITHUB_AUTH_IDENTITY_INVALID", message: "GitHub must provide a verified email address to sign in." });
  }
  return {
    providerAccountId: String(profile.id),
    email,
    displayName: typeof profile.name === "string" && profile.name.trim() ? profile.name : typeof profile.login === "string" ? profile.login : null,
  };
}

function primaryVerifiedEmail(value: unknown) {
  if (!Array.isArray(value)) return null;
  const emails = value.filter((item): item is { email?: unknown; verified?: unknown; primary?: unknown } => Boolean(item) && typeof item === "object");
  const selected = emails.find((item) => item.primary === true && item.verified === true) ?? emails.find((item) => item.verified === true);
  return typeof selected?.email === "string" && selected.email.includes("@") ? selected.email.trim().toLowerCase() : null;
}
