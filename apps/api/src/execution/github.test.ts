import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeGitHubCreateIssue } from "./execution.service";

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
      mode: "live",
      sentAt: result.output.sentAt,
    });
    assert.equal(typeof result.output.sentAt, "string");
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
      (error: any) => error.code === "HTTP_ERROR" && error.statusCode === 503 && error.retryable === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
