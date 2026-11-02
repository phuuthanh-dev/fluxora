import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeGitHubAddComment, executeGitHubAddLabel, executeGitHubCreateIssue, executeGitHubMergePullRequest, executeNode } from "./execution.service";
import { resolveExpressions } from "./expression";
import type { WorkflowNode } from "@workflow/contracts";

process.env.OUTBOUND_ALLOWED_HOSTNAMES = "api.github.com";

function createMockCredentials(store: Record<string, { provider: CredentialProvider; data: Record<string, unknown> }>): CredentialService {
  return {
    readForExecution: async (credentialId: string, _workspaceId: string, provider: CredentialProvider) => {
      const entry = store[credentialId];
      if (!entry || entry.provider !== provider) throw new Error("Credential not found");
      return entry.data;
    },
  } as unknown as CredentialService;
}

test("GitHub Create Issue mock mode is deterministic and does not call the provider", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("mock mode must not call fetch");
  }) as typeof fetch;

  try {
    const result = await executeGitHubCreateIssue(
      { repository: "acme/automation", title: "Daily report", body: "Details", labels: "automation, daily" },
      "mock",
      "workspace-1",
      createMockCredentials({}),
    );
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.output, {
      delivered: true,
      provider: "github",
      operation: "create_issue",
      repository: "acme/automation",
      issueNumber: 1,
      url: "https://github.com/acme/automation/issues/1",
      labels: ["automation", "daily"],
      deduplicated: false,
      mode: "mock",
    });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Create Issue live mode uses the workspace connector credential and normalized output", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ number: 42, html_url: "https://github.com/acme/automation/issues/42" }, { status: 201 });
  }) as typeof fetch;

  try {
    const result = await executeGitHubCreateIssue(
      { credentialId: "github-credential", repository: "acme/automation", title: "Daily report", body: "Details", labels: "automation" },
      "live",
      "workspace-1",
      credentials,
    );
    assert.equal(result.status, "succeeded");
    assert.equal(requestUrl, "https://api.github.com/repos/acme/automation/issues");
    assert.equal(requestInit?.method, "POST");
    assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer ghs_test_secret");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { title: "Daily report", body: "Details", labels: ["automation"] });
    assert.deepEqual(result.output, {
      delivered: true,
      provider: "github",
      operation: "create_issue",
      repository: "acme/automation",
      issueNumber: 42,
      url: "https://github.com/acme/automation/issues/42",
      labels: ["automation"],
      deduplicated: false,
      mode: "live",
      sentAt: result.output.sentAt,
    });
    assert.equal(typeof result.output.sentAt, "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Create Issue reuses an existing issue for the same idempotency key", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return Response.json({ items: [{ number: 7, html_url: "https://github.com/acme/automation/issues/7", body: "Existing issue\n\n<!-- fluxora:github:create-issue:39d153015d3cfa60deb8ca716a59816cee55ab37f86364dbf6b3b024aeddd909 -->" }] }, { status: 200 });
  }) as typeof fetch;

  try {
    const result = await executeGitHubCreateIssue(
      { credentialId: "github-credential", repository: "acme/automation", title: "Daily report", body: "Details", idempotencyKey: "daily-report-2026-10-27" },
      "live",
      "workspace-1",
      credentials,
    );
    assert.equal(result.status, "succeeded");
    assert.equal(result.output.issueNumber, 7);
    assert.equal(result.output.deduplicated, true);
    assert.equal(requests.length, 1);
    assert.match(requests[0]!, /search\/issues\?q=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Create Issue adds only a hashed marker when idempotency lookup misses", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (requests.length === 1) return Response.json({ items: [] }, { status: 200 });
    return Response.json({ number: 8, html_url: "https://github.com/acme/automation/issues/8" }, { status: 201 });
  }) as typeof fetch;

  try {
    const result = await executeGitHubCreateIssue(
      { credentialId: "github-credential", repository: "acme/automation", title: "Daily report", body: "Details", idempotencyKey: "daily-report-2026-10-27" },
      "live",
      "workspace-1",
      credentials,
    );
    const postedBody = JSON.parse(String(requests[1]?.init?.body)) as { body: string };
    assert.equal(result.output.issueNumber, 8);
    assert.equal(result.output.deduplicated, false);
    assert.equal(requests.length, 2);
    assert.match(postedBody.body, /<!-- fluxora:github:create-issue:39d153015d3cfa60deb8ca716a59816cee55ab37f86364dbf6b3b024aeddd909 -->/);
    assert.ok(!postedBody.body.includes("daily-report-2026-10-27"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Create Issue rejects unsafe idempotency keys without a provider call", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return Response.json({ items: [] });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => executeGitHubCreateIssue({ repository: "acme/automation", title: "Issue", idempotencyKey: "bad\nkey" }, "mock", "workspace-1", createMockCredentials({})),
      (error: any) => error.code === "INVALID_CONFIGURATION" && error.retryable === false,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Create Issue validates repository and classifies provider failures", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  await assert.rejects(
    () => executeGitHubCreateIssue({ repository: "not-a-repository", title: "Issue" }, "mock", "workspace-1", credentials),
    (error: any) => error.code === "INVALID_CONFIGURATION" && error.retryable === false,
  );

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ message: "Bad credentials" }, { status: 401 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubCreateIssue({ credentialId: "github-credential", repository: "acme/automation", title: "Issue" }, "live", "workspace-1", credentials),
      (error: any) => error.code === "HTTP_ERROR" && error.statusCode === 401 && error.retryable === false && !error.message.includes("Bad credentials"),
    );

    globalThis.fetch = (async () => Response.json({ message: "Server unavailable" }, { status: 503 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubCreateIssue({ credentialId: "github-credential", repository: "acme/automation", title: "Issue" }, "live", "workspace-1", credentials),
      (error: any) => error.code === "DELIVERY_UNCERTAIN" && error.statusCode === 503 && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Add Label mock mode is deterministic and does not call the provider", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("mock mode must not call fetch");
  }) as typeof fetch;
  try {
    const result = await executeGitHubAddLabel(
      { repository: "acme/automation", issueNumber: "42", label: "automation" },
      "mock",
      "workspace-1",
      createMockCredentials({}),
    );
    assert.deepEqual(result.output, {
      delivered: true,
      provider: "github",
      operation: "add_label",
      repository: "acme/automation",
      issueNumber: 42,
      addedLabel: "automation",
      labels: ["automation"],
      mode: "mock",
    });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Add Label live mode uses the connector credential and safe fixed API route", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json([{ name: "bug" }, { name: "automation" }], { status: 200 });
  }) as typeof fetch;
  try {
    const result = await executeGitHubAddLabel(
      { credentialId: "github-credential", repository: "acme/automation", issueNumber: 42, label: "bug" },
      "live",
      "workspace-1",
      credentials,
    );
    assert.equal(result.status, "succeeded");
    assert.equal(requestUrl, "https://api.github.com/repos/acme/automation/issues/42/labels");
    assert.equal(requestInit?.method, "POST");
    assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer ghs_test_secret");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { labels: ["bug"] });
    assert.deepEqual(result.output.labels, ["bug", "automation"]);
    assert.equal(result.output.addedLabel, "bug");
    assert.equal(result.output.mode, "live");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Add Label validates issue number and retry classification", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  await assert.rejects(
    () => executeGitHubAddLabel({ repository: "acme/automation", issueNumber: "0", label: "bug" }, "mock", "workspace-1", credentials),
    (error: any) => error.code === "INVALID_CONFIGURATION" && error.retryable === false,
  );
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ message: "Validation failed" }, { status: 422 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubAddLabel({ credentialId: "github-credential", repository: "acme/automation", issueNumber: 42, label: "bug" }, "live", "workspace-1", credentials),
      (error: any) => error.code === "HTTP_ERROR" && error.statusCode === 422 && error.retryable === false,
    );
    globalThis.fetch = (async () => Response.json({ message: "Server unavailable" }, { status: 503 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubAddLabel({ credentialId: "github-credential", repository: "acme/automation", issueNumber: 42, label: "bug" }, "live", "workspace-1", credentials),
      (error: any) => error.code === "DELIVERY_UNCERTAIN" && error.statusCode === 503 && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Add Comment mock mode is deterministic and does not call the provider", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("mock mode must not call fetch");
  }) as typeof fetch;
  try {
    const result = await executeGitHubAddComment(
      { repository: "acme/automation", issueNumber: "42", body: "Daily report is ready." },
      "mock",
      "workspace-1",
      createMockCredentials({}),
    );
    assert.deepEqual(result.output, {
      delivered: true,
      provider: "github",
      operation: "add_comment",
      repository: "acme/automation",
      issueNumber: 42,
      commentId: 1,
      url: "https://github.com/acme/automation/issues/42#issuecomment-1",
      body: "Daily report is ready.",
      mode: "mock",
    });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Add Comment live mode uses the connector credential and safe fixed API route", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ id: 99, html_url: "https://github.com/acme/automation/issues/42#issuecomment-99", body: "Daily report is ready." }, { status: 201 });
  }) as typeof fetch;
  try {
    const result = await executeGitHubAddComment(
      { credentialId: "github-credential", repository: "acme/automation", issueNumber: 42, body: "Daily report is ready." },
      "live",
      "workspace-1",
      credentials,
    );
    assert.equal(result.status, "succeeded");
    assert.equal(requestUrl, "https://api.github.com/repos/acme/automation/issues/42/comments");
    assert.equal(requestInit?.method, "POST");
    assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer ghs_test_secret");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { body: "Daily report is ready." });
    assert.equal(result.output.commentId, 99);
    assert.equal(result.output.url, "https://github.com/acme/automation/issues/42#issuecomment-99");
    assert.equal(result.output.body, "Daily report is ready.");
    assert.equal(result.output.mode, "live");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Add Comment validates body and retry classification", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  await assert.rejects(
    () => executeGitHubAddComment({ repository: "acme/automation", issueNumber: "42", body: "" }, "mock", "workspace-1", credentials),
    (error: any) => error.code === "INVALID_CONFIGURATION" && error.retryable === false,
  );
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ message: "Validation failed" }, { status: 422 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubAddComment({ credentialId: "github-credential", repository: "acme/automation", issueNumber: 42, body: "Comment" }, "live", "workspace-1", credentials),
      (error: any) => error.code === "HTTP_ERROR" && error.statusCode === 422 && error.retryable === false,
    );
    globalThis.fetch = (async () => Response.json({ message: "Server unavailable" }, { status: 503 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubAddComment({ credentialId: "github-credential", repository: "acme/automation", issueNumber: 42, body: "Comment" }, "live", "workspace-1", credentials),
      (error: any) => error.code === "DELIVERY_UNCERTAIN" && error.statusCode === 503 && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Merge Pull Request mock mode is deterministic and does not call the provider", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("mock mode must not call fetch");
  }) as typeof fetch;
  try {
    const result = await executeGitHubMergePullRequest(
      { repository: "acme/automation", pullRequestNumber: "12", mergeMethod: "squash" },
      "mock",
      "workspace-1",
      createMockCredentials({}),
    );
    assert.deepEqual(result.output, {
      delivered: true,
      provider: "github",
      operation: "merge_pull_request",
      repository: "acme/automation",
      pullRequestNumber: 12,
      merged: true,
      sha: "mock-merge-sha",
      message: "Pull Request successfully merged",
      mergeMethod: "squash",
      url: "https://github.com/acme/automation/pull/12",
      mode: "mock",
    });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Merge Pull Request live mode uses the connector credential and safe fixed API route", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ merged: true, sha: "abc123", message: "Pull Request successfully merged" }, { status: 200 });
  }) as typeof fetch;
  try {
    const result = await executeGitHubMergePullRequest(
      { credentialId: "github-credential", repository: "acme/automation", pullRequestNumber: 12, mergeMethod: "squash" },
      "live",
      "workspace-1",
      credentials,
    );
    assert.equal(result.status, "succeeded");
    assert.equal(requestUrl, "https://api.github.com/repos/acme/automation/pulls/12/merge");
    assert.equal(requestInit?.method, "PUT");
    assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer ghs_test_secret");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { merge_method: "squash" });
    assert.equal(result.output.merged, true);
    assert.equal(result.output.sha, "abc123");
    assert.equal(result.output.mergeMethod, "squash");
    assert.equal(result.output.mode, "live");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Merge Pull Request validates merge method and retry classification", async () => {
  const credentials = createMockCredentials({
    "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } },
  });
  await assert.rejects(
    () => executeGitHubMergePullRequest({ repository: "acme/automation", pullRequestNumber: 12, mergeMethod: "fast-forward" }, "mock", "workspace-1", credentials),
    (error: any) => error.code === "INVALID_CONFIGURATION" && error.retryable === false,
  );
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ message: "Pull Request is not mergeable" }, { status: 405 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubMergePullRequest({ credentialId: "github-credential", repository: "acme/automation", pullRequestNumber: 12 }, "live", "workspace-1", credentials),
      (error: any) => error.code === "HTTP_ERROR" && error.statusCode === 405 && error.retryable === false,
    );
    globalThis.fetch = (async () => Response.json({ message: "Server unavailable" }, { status: 503 })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubMergePullRequest({ credentialId: "github-credential", repository: "acme/automation", pullRequestNumber: 12 }, "live", "workspace-1", credentials),
      (error: any) => error.code === "DELIVERY_UNCERTAIN" && error.statusCode === 503 && error.retryable === false,
    );
    globalThis.fetch = (async () => Response.json({ merged: false, sha: "abc123", message: "Not merged" })) as typeof fetch;
    await assert.rejects(
      () => executeGitHubMergePullRequest({ credentialId: "github-credential", repository: "acme/automation", pullRequestNumber: 12 }, "live", "workspace-1", credentials),
      (error: any) => error.code === "DELIVERY_UNCERTAIN" && error.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub merge can require the exact reviewed pull request head", async () => {
  const credentials = createMockCredentials({ "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } } });
  const config = { credentialId: "github-credential", repository: "acme/automation", pullRequestNumber: 12, expectedHeadSha: "A".repeat(40) };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      assert.deepEqual(JSON.parse(String(init?.body)), { merge_method: "merge", sha: "a".repeat(40) });
      return new Response("provider details", { status: 409 });
    }) as typeof fetch;
    await assert.rejects(executeGitHubMergePullRequest(config, "live", "workspace-1", credentials), (error: any) => error.code === "GITHUB_HEAD_CHANGED" && error.statusCode === 409 && error.retryable === false && !error.message.includes("provider details"));
    assert.equal(calls, 1);
    await assert.rejects(executeGitHubMergePullRequest({ ...config, expectedHeadSha: "abc" }, "live", "workspace-1", credentials), (error: any) => error.code === "INVALID_CONFIGURATION" && !error.retryable);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("GitHub never drops an expression-backed merge guard when it cannot resolve", async () => {
  const noCredential = { readForExecution: () => { throw new Error("credential must not be read"); } } as never;
  for (const [expression, context] of [
    ["{{ input.head }}", {}],
    ["{{ input.head }}", { input: { head: null } }],
    [" {{ input.head }} ", {}],
  ] as const) {
    const raw = { repository: "acme/automation", pullRequestNumber: 12, expectedHeadSha: expression };
    const node: WorkflowNode = { id: "merge", type: "action.github.merge-pull-request", config: raw, position: { x: 0, y: 0 } };
    const resolved = resolveExpressions(raw, context) as Record<string, unknown>;
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(executeNode(node, resolved, context, mode, "workspace", noCredential, "execution"), (error: any) => error.code === "INVALID_CONFIGURATION" && !error.retryable);
    }
  }
  await assert.rejects(executeGitHubMergePullRequest({ repository: "acme/automation", pullRequestNumber: 12, expectedHeadSha: undefined }, "live", "workspace", noCredential), (error: any) => error.code === "INVALID_CONFIGURATION");
  // Saved graphs that never requested the guard retain the legacy behavior.
  for (const value of [undefined, null, ""]) {
    const raw = { repository: "acme/automation", pullRequestNumber: 12, ...(value === undefined ? {} : { expectedHeadSha: value }) };
    const node: WorkflowNode = { id: "merge", type: "action.github.merge-pull-request", config: raw, position: { x: 0, y: 0 } };
    assert.equal((await executeNode(node, raw, {}, "mock", "workspace", noCredential, "execution")).status, "succeeded");
  }
  const raw = { repository: "acme/automation", pullRequestNumber: 12, expectedHeadSha: "{{ input.head }}" };
  const node: WorkflowNode = { id: "merge", type: "action.github.merge-pull-request", config: raw, position: { x: 0, y: 0 } };
  const context = { input: { head: "a".repeat(40) } };
  const resolved = resolveExpressions(raw, context) as Record<string, unknown>;
  assert.equal((await executeNode(node, resolved, context, "mock", "workspace", noCredential, "execution")).status, "succeeded");
});

test("GitHub never drops expression-backed merge method or issue idempotency", async () => {
  const noCredential = { readForExecution: () => { throw new Error("credential must not be read"); } } as never;
  const cases = [
    { type: "action.github.merge-pull-request" as const, raw: { repository: "acme/automation", pullRequestNumber: 12, mergeMethod: "{{ input.method }}" }, input: { method: "squash" } },
    { type: "action.github" as const, raw: { repository: "acme/automation", title: "Example", idempotencyKey: "{{ input.key }}" }, input: { key: "stable-key" } },
    { type: "action.github" as const, raw: { repository: "acme/automation", title: "Example", idempotencyKey: "issue-{{ input.key }}" }, input: { key: "stable-key" } },
  ];
  for (const { type, raw, input } of cases) {
    const node: WorkflowNode = { id: "github", type, config: raw, position: { x: 0, y: 0 } };
    const missing = resolveExpressions(raw, {}) as Record<string, unknown>;
    for (const mode of ["mock", "live"] as const) await assert.rejects(executeNode(node, missing, {}, mode, "workspace", noCredential, "execution"), (error: any) => error.code === "INVALID_CONFIGURATION" && !error.retryable);
    const context = { input };
    const resolved = resolveExpressions(raw, context) as Record<string, unknown>;
    assert.equal((await executeNode(node, resolved, context, "mock", "workspace", noCredential, "execution")).status, "succeeded");
  }
});

test("GitHub writes do not replay their bodies on redirects", async () => {
  const credentials = createMockCredentials({ "github-credential": { provider: CredentialProvider.GITHUB, data: { token: "ghs_test_secret" } } });
  const base = { credentialId: "github-credential", repository: "acme/automation" };
  const operations = [
    () => executeGitHubCreateIssue({ ...base, title: "Test" }, "live", "workspace-1", credentials),
    () => executeGitHubAddLabel({ ...base, issueNumber: 12, label: "test" }, "live", "workspace-1", credentials),
    () => executeGitHubAddComment({ ...base, issueNumber: 12, body: "Test" }, "live", "workspace-1", credentials),
    () => executeGitHubMergePullRequest({ ...base, pullRequestNumber: 12 }, "live", "workspace-1", credentials),
  ];
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [307, 308]) for (const operation of operations) {
      let calls = 0;
      globalThis.fetch = (async () => { calls++; return new Response(null, { status, headers: { location: "https://api.github.com/redirected" } }); }) as typeof fetch;
      await assert.rejects(operation(), (error: any) => error.code === "DELIVERY_UNCERTAIN" && error.retryable === false);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});
