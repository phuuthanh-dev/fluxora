import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { OutboundRequestPolicyError } from "./outbound-url-policy";
import { executeGitHubGetIssue, executeGitHubGetPullRequest, executeGitHubListIssues, executeGitHubListPullRequests } from "./github-read";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.GITHUB);
  return { token: "synthetic-token" };
} } as unknown as CredentialService;
const config = { credentialId: "connection", repository: "acme/project" };
const issue = (number = 1) => ({ number, title: "Issue", state: "open", html_url: `https://github.com/acme/project/issues/${number}`, body: "Description", user: { login: "author" }, private_metadata: "exclude-me" });
const pull = (number = 2) => ({ number, title: "PR", state: "closed", html_url: `https://github.com/acme/project/pull/${number}`, draft: false, head: { sha: "abc", ref: "topic" }, base: { ref: "main" }, merged_at: "2030-01-01T00:00:00Z" });
const failure = (code: string, retryable = false) => (error: unknown) => error instanceof NodeFailure && error.code === code && error.retryable === retryable && !error.message.includes("secret-detail");

test("issue list uses workspace credentials, safe headers and explicit continuation, excluding pull requests", async () => {
  const result = await executeGitHubListIssues({ ...config, state: "all", page: 2, pageSize: 2 }, "live", "workspace", credentials, async (request, init) => {
    const url = new URL(request);
    assert.equal(url.origin + url.pathname, "https://api.github.com/repos/acme/project/issues");
    assert.equal(url.searchParams.get("state"), "all"); assert.equal(url.searchParams.get("page"), "2"); assert.equal(url.searchParams.get("per_page"), "2");
    assert.ok(!request.includes("synthetic-token"));
    assert.equal(init.method, "GET");
    assert.deepEqual(init.headers, { Accept: "application/vnd.github+json", Authorization: "Bearer synthetic-token", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Fluxora" });
    const next = new URL(request); next.searchParams.set("page", "3");
    return Response.json([issue(), { ...issue(2), pull_request: {} }], { headers: { link: `<${next}>; rel="next"` } });
  });
  assert.equal(result.output.items?.length, 1); assert.equal(result.output.nextPage, 3); assert.equal(result.output.hasMore, true);
  assert.ok(!JSON.stringify(result).includes("exclude-me")); assert.ok(!JSON.stringify(result).includes("synthetic-token"));
});

test("pull request list and both details normalize bounded useful fields", async () => {
  const list = await executeGitHubListPullRequests(config, "live", "workspace", credentials, async (url) => {
    assert.equal(new URL(url).pathname, "/repos/acme/project/pulls"); return Response.json([pull()]);
  });
  assert.equal(list.output.items?.[0]?.number, 2); assert.equal(list.output.items?.[0]?.headSha, "abc"); assert.equal(list.output.nextPage, null);
  const detail = await executeGitHubGetPullRequest({ ...config, pullRequestNumber: "2" }, "live", "workspace", credentials, async (url) => {
    assert.equal(new URL(url).pathname, "/repos/acme/project/pulls/2"); return Response.json(pull());
  });
  assert.equal(detail.output.item?.baseRef, "main");
  const issueDetail = await executeGitHubGetIssue({ ...config, issueNumber: 1 }, "live", "workspace", credentials, async () => Response.json({ ...issue(), body: "a".repeat(70000) }));
  assert.equal(issueDetail.output.item?.body?.length, 65536);
  assert.equal(issueDetail.output.item?.bodyTruncated, true);
  assert.equal(list.output.items?.[0]?.bodyTruncated, false);
  const redacted = await executeGitHubGetIssue({ ...config, issueNumber: 1 }, "live", "workspace", credentials, async () => Response.json({ ...issue(), title: "synthetic-token", body: `${"x".repeat(65530)}synthetic-token` }));
  assert.ok(!JSON.stringify(redacted.output).includes("synthetic-token"));
});

test("mock mode validates input but accesses neither credentials nor transport", async () => {
  const forbidden = { readForExecution: () => { throw new Error("must not read credential"); } } as unknown as CredentialService;
  const transport = async () => { throw new Error("must not call provider"); };
  const result = await executeGitHubListIssues({ repository: "acme/project" }, "mock", "workspace", forbidden, transport);
  assert.equal(result.output.items?.[0]?.title, "Example issue");
  const pull = await executeGitHubGetPullRequest({ repository: "acme/project", pullRequestNumber: 1 }, "mock", "workspace", forbidden, transport);
  assert.equal(pull.output.item?.headSha, "a".repeat(40));
  await assert.rejects(executeGitHubGetIssue({ repository: "../project", issueNumber: 1 }, "mock", "workspace", forbidden, transport), failure("INVALID_CONFIGURATION"));
});

test("rejects unsafe repository, status, page, size and detail numbers before credentials", async () => {
  for (const bad of ["../project", "acme/..", "acme/project?x=1", "https://evil.example/a", "acme/%2e%2e", "acme/a/b"]) {
    await assert.rejects(executeGitHubListIssues({ ...config, repository: bad }, "live", "workspace", credentials), failure("INVALID_CONFIGURATION"));
  }
  for (const invalid of [{ state: "merged" }, { state: null }, { page: 0 }, { page: 1001 }, { page: "1e2" }, { pageSize: 101 }, { pageSize: 1.2 }]) {
    await assert.rejects(executeGitHubListPullRequests({ ...config, ...invalid }, "live", "workspace", credentials), failure("INVALID_CONFIGURATION"));
  }
  for (const issueNumber of [0, -1, "01", "1/../2", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(executeGitHubGetIssue({ ...config, issueNumber }, "live", "workspace", credentials), failure("INVALID_CONFIGURATION"));
  }
});

test("rejects malicious or inconsistent provider URLs and issue detail for a pull request", async () => {
  for (const html_url of ["http://github.com/acme/project/issues/1", "https://github.com.evil.example/acme/project/issues/1", "https://user@github.com/acme/project/issues/1", "https://github.com/acme/project/issues/2", "https://github.com/acme/project/issues/1?token=x"]) {
    await assert.rejects(executeGitHubGetIssue({ ...config, issueNumber: 1 }, "live", "workspace", credentials, async () => Response.json({ ...issue(), html_url })), failure("INVALID_PROVIDER_RESPONSE"));
  }
  await assert.rejects(executeGitHubGetIssue({ ...config, issueNumber: 1 }, "live", "workspace", credentials, async () => Response.json({ ...issue(), pull_request: {} })), failure("INVALID_PROVIDER_RESPONSE"));
  await assert.rejects(executeGitHubGetIssue({ ...config, issueNumber: 2 }, "live", "workspace", credentials, async () => Response.json(issue())), failure("INVALID_PROVIDER_RESPONSE"));
});

test("validates continuation targets and reports page ceiling without fetching links", async () => {
  for (const link of [
    '<https://evil.example/repos/acme/project/issues?state=open&per_page=30&page=2>; rel="next"',
    '<https://api.github.com/repos/other/project/issues?state=open&per_page=30&page=2>; rel="next"',
    '<https://api.github.com/repos/acme/project/issues?state=closed&per_page=30&page=2>; rel="next"',
    '<https://api.github.com/repos/acme/project/issues?state=open&per_page=30&page=3>; rel="next"',
  ]) await assert.rejects(executeGitHubListIssues(config, "live", "workspace", credentials, async () => Response.json([], { headers: { link } })), failure("INVALID_PROVIDER_RESPONSE"));
  const result = await executeGitHubListIssues({ ...config, page: 1000 }, "live", "workspace", credentials, async (request) => {
    const next = new URL(request); next.searchParams.set("page", "1001");
    return Response.json([], { headers: { link: `<${next}>; rel="next"` } });
  });
  assert.equal(result.output.hasMore, true); assert.equal(result.output.nextPage, null); assert.equal(result.output.truncated, true);
});

test("sanitizes errors, preserves policy failures, and bounds provider responses", async () => {
  for (const [status, retryable] of [[401, false], [403, false], [404, false], [429, true], [500, true]] as const) {
    await assert.rejects(executeGitHubListIssues(config, "live", "workspace", credentials, async () => new Response("secret-detail", { status })), failure("HTTP_ERROR", retryable));
  }
  await assert.rejects(executeGitHubListIssues(config, "live", "workspace", credentials, async () => { throw new Error("secret-detail"); }), failure("NETWORK_ERROR", true));
  await assert.rejects(executeGitHubListIssues(config, "live", "workspace", credentials, async () => { throw new OutboundRequestPolicyError("OUTBOUND_REDIRECT_BLOCKED", "Outbound redirect target is not permitted."); }), failure("OUTBOUND_REDIRECT_BLOCKED"));
  await assert.rejects(executeGitHubListIssues(config, "live", "workspace", credentials, async () => new Response("x".repeat(1_000_001))), failure("RESPONSE_TOO_LARGE"));
  await assert.rejects(executeGitHubListIssues(config, "live", "workspace", credentials, async () => new Response("secret-detail")), failure("INVALID_PROVIDER_RESPONSE"));
  await assert.rejects(executeGitHubListIssues({ ...config, pageSize: 1 }, "live", "workspace", credentials, async () => Response.json([issue(), issue(2)])), failure("INVALID_PROVIDER_RESPONSE"));
});


test("requires the selected workspace credential and rejects invalid token headers", async () => {
  await assert.rejects(executeGitHubListIssues({ repository: "acme/project" }, "live", "workspace", credentials), failure("CREDENTIAL_REQUIRED"));
  const invalid = { readForExecution: async () => ({ token: "bad\r\nheader" }) } as unknown as CredentialService;
  await assert.rejects(executeGitHubListIssues(config, "live", "workspace", invalid, async () => { throw new Error("unexpected transport"); }), failure("CREDENTIAL_INVALID"));
  const denied = { readForExecution: async (_id: string, workspace: string) => { assert.equal(workspace, "other-workspace"); throw new NodeFailure("CREDENTIAL_NOT_FOUND", "Connection not found.", false); } } as unknown as CredentialService;
  await assert.rejects(executeGitHubListIssues(config, "live", "other-workspace", denied, async () => { throw new Error("unexpected transport"); }), failure("CREDENTIAL_NOT_FOUND"));
});
