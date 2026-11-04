import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { executeGitHubUpdateIssue } from "./github-update-issue";

const config = { credentialId: "connection", repository: "owner/repo", issueNumber: "42", field: "title", title: "Updated" };
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.GITHUB);
  return { token: "synthetic-token" };
} } as unknown as CredentialService;
const validRead = async () => Response.json({ number: 42, title: "Original" });
const failure = (code: string) => (error: unknown) => error instanceof NodeFailure && error.code === code && !error.retryable && !error.message.includes("synthetic-token");

test("updates a single selected field after checking issue identity", async () => {
  for (const [field, value] of [["title", "Updated"], ["body", ""], ["state", "closed"]] as const) {
    let calls = 0;
    const result = await executeGitHubUpdateIssue({ ...config, field, [field]: value }, "live", "workspace", credentials, validRead, async (url, init) => {
      calls++;
      assert.equal(url, "https://api.github.com/repos/owner/repo/issues/42");
      assert.equal(init.method, "PATCH");
      assert.deepEqual(JSON.parse(String(init.body)), { [field]: value });
      assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic-token");
      return Response.json({ number: 42, [field]: value });
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.output, { repository: "owner/repo", issueNumber: 42, updatedField: field });
    assert.ok(!JSON.stringify(result).includes("synthetic-token"));
  }
});

test("validates before accessing a connection, and never changes a pull request", async () => {
  const forbidden = { readForExecution: () => { throw new Error("unexpected credential read"); } } as unknown as CredentialService;
  const mock = await executeGitHubUpdateIssue(config, "mock", "workspace", forbidden);
  assert.equal(mock.output.updatedField, "title");
  for (const invalid of [{ issueNumber: "0" }, { repository: "owner/../other" }, { field: undefined }, { field: "body", body: undefined }, { field: "state", state: "all" }, { title: " " }]) {
    await assert.rejects(executeGitHubUpdateIssue({ ...config, ...invalid }, "live", "workspace", forbidden), failure("INVALID_CONFIGURATION"));
  }
  let writes = 0;
  await assert.rejects(executeGitHubUpdateIssue(config, "live", "workspace", credentials, async () => Response.json({ number: 42, pull_request: {} }), async () => { writes++; return new Response(); }), failure("INVALID_PROVIDER_RESPONSE"));
  assert.equal(writes, 0);
});

test("does not automatically retry an ambiguous update or expose provider errors", async () => {
  for (const status of [301, 408, 429, 500]) {
    await assert.rejects(executeGitHubUpdateIssue(config, "live", "workspace", credentials, validRead, async () => new Response(null, { status })), failure("DELIVERY_UNCERTAIN"));
  }
  await assert.rejects(executeGitHubUpdateIssue(config, "live", "workspace", credentials, validRead, async () => { throw new Error("synthetic-token"); }), failure("DELIVERY_UNCERTAIN"));
  await assert.rejects(executeGitHubUpdateIssue(config, "live", "workspace", credentials, validRead, async () => Response.json({ number: 42, title: "Different" })), failure("DELIVERY_UNCERTAIN"));
  await assert.rejects(executeGitHubUpdateIssue(config, "live", "workspace", credentials, validRead, async () => new Response("synthetic-token", { status: 403 })), failure("GITHUB_WRITE_REJECTED"));
});
