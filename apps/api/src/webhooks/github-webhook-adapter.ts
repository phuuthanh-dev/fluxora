import { ProviderWebhookAdapter, ProviderWebhookError, ProviderWebhookIdentity, ProviderWebhookInspection, ProviderWebhookSpec } from "./provider-webhook-adapter";

const events = new Set(["push", "issues", "pull_request", "workflow_run"]);

/** Talks only to GitHub's fixed API host. It never logs credentials or remote response bodies. */
export class GitHubWebhookAdapter implements ProviderWebhookAdapter {
  constructor(private readonly request: typeof fetch = fetch) {}

  async create(token: string, spec: ProviderWebhookSpec): Promise<ProviderWebhookIdentity> {
    const repo = parseRepository(spec.repository);
    let url: URL;
    try { url = new URL(spec.url); } catch { throw new ProviderWebhookError("INVALID_INPUT", false); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash || !events.has(spec.event) || !spec.secret) throw new ProviderWebhookError("INVALID_INPUT", false);
    const response = await this.call(token, `/repos/${repo}/hooks`, "POST", { name: "web", active: true, events: [spec.event], config: { url: url.toString(), content_type: "json", insecure_ssl: "0", secret: spec.secret } });
    const body = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!body || !Number.isSafeInteger(body.id) || (body.id as number) <= 0) throw new ProviderWebhookError("OUTCOME_UNKNOWN", false);
    return { repository: spec.repository, hookId: body.id as number };
  }

  async exists(token: string, identity: ProviderWebhookIdentity): Promise<boolean> {
    // GitHub can return 404 for missing permission as well as missing hooks.
    await this.call(token, hookPath(identity), "GET");
    return true;
  }

  async inspect(token: string, identity: ProviderWebhookIdentity, expected: { url: string; event: string }): Promise<ProviderWebhookInspection> {
    const response = await this.call(token, hookPath(identity), "GET");
    const body = await response.json().catch(() => null) as { id?: unknown; active?: unknown; events?: unknown; config?: { url?: unknown } } | null;
    if (!body || body.id !== identity.hookId || typeof body.active !== "boolean" || !Array.isArray(body.events) || !body.events.every((event: unknown) => typeof event === "string") || typeof body.config?.url !== "string") {
      throw new ProviderWebhookError("UNAVAILABLE", false);
    }
    // Return only comparisons: provider URLs can contain secrets. GitHub never returns the signing secret.
    return { urlMatches: body.config.url === expected.url, eventsMatch: body.events.length === 1 && body.events[0] === expected.event, active: body.active };
  }

  async remove(token: string, identity: ProviderWebhookIdentity): Promise<void> {
    await this.call(token, hookPath(identity), "DELETE");
  }

  private async call(token: string, path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<Response> {
    if (!token.trim()) throw new ProviderWebhookError("INVALID_INPUT", false);
    let response: Response;
    try {
      response = await this.request(`https://api.github.com${path}`, { method, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Fluxora" }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15_000) });
    } catch { throw new ProviderWebhookError(method === "GET" ? "UNAVAILABLE" : "OUTCOME_UNKNOWN", method === "GET"); }
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403) throw new ProviderWebhookError("FORBIDDEN", false);
    if (response.status === 404) throw new ProviderWebhookError("NOT_FOUND", false);
    if (response.status === 409 || response.status === 422) throw new ProviderWebhookError("CONFLICT", false);
    throw new ProviderWebhookError(method === "GET" ? "UNAVAILABLE" : "OUTCOME_UNKNOWN", method === "GET");
  }
}

function parseRepository(repository: string): string {
  const parts = repository.split("/");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== "." && part !== "..")) throw new ProviderWebhookError("INVALID_INPUT", false);
  return parts.map(encodeURIComponent).join("/");
}

function hookPath(identity: ProviderWebhookIdentity): string {
  if (!Number.isSafeInteger(identity.hookId) || identity.hookId <= 0) throw new ProviderWebhookError("INVALID_INPUT", false);
  return `/repos/${parseRepository(identity.repository)}/hooks/${identity.hookId}`;
}
