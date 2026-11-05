import { createHash } from "node:crypto";
import { nodeConfigIssues } from "@workflow/contracts";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import type { RunMode, NodeResult } from "./node-executor-contract";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { readCredentialId } from "./connector-config";
import { fetchSafeOutbound, fetchSafeOutboundWrite } from "./outbound-url-policy";
import { requireProviderSuccess, readProviderJson, uncertainDelivery } from "./provider-request-policy";

export async function executeGitHubCreateIssue(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  requireGitHubConfig("action.github", config);
  if (Object.hasOwn(config, "idempotencyKey") && config.idempotencyKey === undefined) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub idempotency key could not be resolved.", false);
  const repository = readGitHubRepository(config.repository);
  const title = typeof config.title === "string" ? config.title.trim() : "";
  const body = typeof config.body === "string" ? config.body : "";
  const labels = readGitHubLabels(config.labels);
  const idempotencyKey = readGitHubIdempotencyKey(config.idempotencyKey);
  if (!title) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue title is required.", false);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "create_issue",
        repository,
        issueNumber: 1,
        url: `https://github.com/${repository}/issues/1`,
        labels,
        deduplicated: false,
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);

  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Fluxora",
  };
  try {
    const marker = idempotencyKey ? githubIdempotencyMarker(idempotencyKey) : undefined;
    if (marker) {
      const existing = await findGitHubIssueByMarker(owner, repo, marker, headers);
      if (existing) {
        return {
          status: "succeeded",
          output: {
            delivered: true,
            provider: "github",
            operation: "create_issue",
            repository,
            issueNumber: existing.number,
            url: existing.url,
            labels,
            deduplicated: true,
            mode: "live",
            sentAt: new Date().toISOString(),
          },
          route: "success",
        };
      }
    }
    const issueBody = marker ? appendGitHubIdempotencyMarker(body, marker) : body;
    const response = await fetchSafeOutboundWrite(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ title, body: issueBody, ...(labels.length ? { labels } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    await requireProviderSuccess(response, "GitHub", true);
    const payload = await readProviderJson(response, "GitHub", true) as { number?: unknown; html_url?: unknown };
    if (!payload || typeof payload.number !== "number" || typeof payload.html_url !== "string") {
      throw uncertainDelivery("GitHub", response.status);
    }
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "create_issue",
        repository,
        issueNumber: payload.number,
        url: payload.html_url,
        labels,
        deduplicated: false,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    const policyFailure = nodeFailureFromOutboundPolicy(reason);
    if (policyFailure.code === "OUTBOUND_URL_BLOCKED") throw policyFailure;
    throw uncertainDelivery("GitHub");
  }
}

export async function executeGitHubAddLabel(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  requireGitHubConfig("action.github.add-label", config);
  const repository = readGitHubRepository(config.repository);
  const issueNumber = readGitHubIssueNumber(config.issueNumber);
  const label = readGitHubLabel(config.label);
  if (!label) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue label is required.", false);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_label",
        repository,
        issueNumber,
        addedLabel: label,
        labels: [label],
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);
  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`;
  try {
    const response = await fetchSafeOutboundWrite(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Fluxora",
      },
      body: JSON.stringify({ labels: [label] }),
      signal: AbortSignal.timeout(15_000),
    });
    await requireProviderSuccess(response, "GitHub", true);
    const payload = await readProviderJson(response, "GitHub", true) as unknown;
    if (!Array.isArray(payload) || !payload.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string")) {
      throw uncertainDelivery("GitHub", response.status);
    }
    const labels = payload.map((item) => (item as { name: string }).name);
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_label",
        repository,
        issueNumber,
        addedLabel: label,
        labels,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    const policyFailure = nodeFailureFromOutboundPolicy(reason);
    if (policyFailure.code === "OUTBOUND_URL_BLOCKED") throw policyFailure;
    throw uncertainDelivery("GitHub");
  }
}

export async function executeGitHubAddComment(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  requireGitHubConfig("action.github.add-comment", config);
  const repository = readGitHubRepository(config.repository);
  const issueNumber = readGitHubIssueNumber(config.issueNumber);
  const body = readGitHubCommentBody(config.body);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_comment",
        repository,
        issueNumber,
        commentId: 1,
        url: `https://github.com/${repository}/issues/${issueNumber}#issuecomment-1`,
        body,
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);
  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`;
  try {
    const response = await fetchSafeOutboundWrite(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Fluxora",
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(15_000),
    });
    await requireProviderSuccess(response, "GitHub", true);
    const payload = await readProviderJson(response, "GitHub", true) as { id?: unknown; html_url?: unknown; body?: unknown };
    if (!payload || typeof payload.id !== "number" || !Number.isSafeInteger(payload.id) || typeof payload.html_url !== "string") {
      throw uncertainDelivery("GitHub", response.status);
    }
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_comment",
        repository,
        issueNumber,
        commentId: payload.id,
        url: payload.html_url,
        body: typeof payload.body === "string" ? payload.body : body,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    const policyFailure = nodeFailureFromOutboundPolicy(reason);
    if (policyFailure.code === "OUTBOUND_URL_BLOCKED") throw policyFailure;
    throw uncertainDelivery("GitHub");
  }
}

export async function executeGitHubMergePullRequest(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  requireGitHubConfig("action.github.merge-pull-request", config);
  const repository = readGitHubRepository(config.repository);
  const pullRequestNumber = readGitHubIssueNumber(config.pullRequestNumber);
  if (Object.hasOwn(config, "mergeMethod") && config.mergeMethod === undefined) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub merge method could not be resolved.", false);
  const mergeMethod = readGitHubMergeMethod(config.mergeMethod);
  if (Object.hasOwn(config, "expectedHeadSha") && config.expectedHeadSha === undefined) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Expected pull request head could not be resolved; review the expression before merging.", false);
  }
  const expectedHeadSha = readGitHubExpectedHeadSha(config.expectedHeadSha);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "merge_pull_request",
        repository,
        pullRequestNumber,
        merged: true,
        sha: "mock-merge-sha",
        message: "Pull Request successfully merged",
        mergeMethod,
        url: `https://github.com/${repository}/pull/${pullRequestNumber}`,
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);
  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/merge`;
  try {
    const response = await fetchSafeOutboundWrite(url, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Fluxora",
      },
      body: JSON.stringify({ merge_method: mergeMethod, ...(expectedHeadSha ? { sha: expectedHeadSha } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 409 && expectedHeadSha) {
      await response.body?.cancel().catch(() => undefined);
      throw new NodeFailure("GITHUB_HEAD_CHANGED", "GitHub rejected the merge because the pull request head no longer matches. Review it before running again.", false, 409);
    }
    await requireProviderSuccess(response, "GitHub", true);
    const payload = await readProviderJson(response, "GitHub", true) as { merged?: unknown; sha?: unknown; message?: unknown };
    if (!payload || payload.merged !== true || typeof payload.sha !== "string" || typeof payload.message !== "string") {
      throw uncertainDelivery("GitHub", response.status);
    }
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "merge_pull_request",
        repository,
        pullRequestNumber,
        merged: payload.merged,
        sha: payload.sha,
        message: payload.message,
        mergeMethod,
        url: `https://github.com/${repository}/pull/${pullRequestNumber}`,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    const policyFailure = nodeFailureFromOutboundPolicy(reason);
    if (policyFailure.code === "OUTBOUND_URL_BLOCKED") throw policyFailure;
    throw uncertainDelivery("GitHub");
  }
}

function requireGitHubConfig(type: string, config: Record<string, unknown>) {
  const issue = nodeConfigIssues(type, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
}

function readGitHubRepository(value: unknown) {
  const repository = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new NodeFailure("INVALID_CONFIGURATION", "GitHub repository must use the owner/repository format.", false);
  }
  return repository;
}

function readGitHubRepositoryParts(repository: string): [string, string] {
  const parts = repository.split("/");
  return [parts[0]!, parts[1]!];
}

function readGitHubLabels(value: unknown) {
  if (value === undefined || value === null || value === "") return [] as string[];
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "GitHub labels must be comma-separated text.", false);
  return value.split(",").map((label) => label.trim()).filter(Boolean).slice(0, 20);
}

function readGitHubIssueNumber(value: unknown) {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d*$/.test(text)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue number must be a positive integer.", false);
  const issueNumber = Number(text);
  if (!Number.isSafeInteger(issueNumber)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue number is too large.", false);
  return issueNumber;
}

function readGitHubLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const label = value.trim();
  if (label.length > 50 || /[\u0000-\u001f\u007f]/.test(label)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue label must be printable text up to 50 characters.", false);
  return label;
}

function readGitHubCommentBody(value: unknown) {
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "GitHub comment body is required.", false);
  if (!value.trim()) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub comment body is required.", false);
  if (value.length > 65_536 || /\u0000/.test(value)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub comment body must be printable text up to 65,536 characters.", false);
  return value;
}

function readGitHubMergeMethod(value: unknown) {
  const mergeMethod = typeof value === "string" && value.trim() ? value.trim() : "merge";
  if (!(mergeMethod === "merge" || mergeMethod === "squash" || mergeMethod === "rebase")) {
    throw new NodeFailure("INVALID_CONFIGURATION", "GitHub merge method must be merge, squash, or rebase.", false);
  }
  return mergeMethod;
}

function readGitHubExpectedHeadSha(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value.trim())) throw new NodeFailure("INVALID_CONFIGURATION", "Expected pull request head must be a full 40-character commit SHA.", false);
  return value.trim().toLowerCase();
}

function readGitHubIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "GitHub idempotency key must be visible ASCII text.", false);
  const key = value.trim();
  if (!/^[\x21-\x7e]{1,160}$/.test(key)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub idempotency key must be visible ASCII text up to 160 characters.", false);
  return key;
}

function githubIdempotencyMarker(key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return `<!-- fluxora:github:create-issue:${digest} -->`;
}

function appendGitHubIdempotencyMarker(body: string, marker: string) {
  return body.includes(marker) ? body : `${body}${body ? "\n\n" : ""}${marker}`;
}

async function findGitHubIssueByMarker(owner: string, repo: string, marker: string, headers: Record<string, string>) {
  const query = encodeURIComponent(`repo:${owner}/${repo} ${marker}`);
  const url = `https://api.github.com/search/issues?q=${query}&per_page=10`;
  let response: Response;
  try {
    response = await fetchSafeOutbound(url, { method: "GET", headers, signal: AbortSignal.timeout(15_000) });
  } catch (reason) {
    throw nodeFailureFromOutboundPolicy(reason);
  }
  await requireProviderSuccess(response, "GitHub", false);
  const payload = await readProviderJson(response, "GitHub") as { items?: unknown } | null;
  if (!payload || !Array.isArray(payload.items)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid search response.", false);
  const match = payload.items.find((item): item is { number: number; html_url: string; body: string } => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return typeof record.number === "number"
      && typeof record.html_url === "string"
      && typeof record.body === "string"
      && record.body.includes(marker);
  });
  return match ? { number: match.number, url: match.html_url } : null;
}
