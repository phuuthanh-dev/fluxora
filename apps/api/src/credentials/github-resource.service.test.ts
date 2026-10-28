import assert from "node:assert/strict";
import test from "node:test";
import { GitHubResourceService, normalizeGitHubRepository } from "./github-resource.service";

test("repository pagination uses a fixed provider URL and returns only safe metadata", async () => {
  const original = globalThis.fetch;
  let requested = "";
  let authorized = false;
  globalThis.fetch = async (input) => {
    requested = String(input);
    assert.equal(authorized, true);
    return new Response(JSON.stringify([{ id: 5, name: "repo", full_name: "owner/repo", private: true, owner: { login: "owner" }, token: "do-not-return" }]), { status: 200, headers: { link: '<https://api.github.com/user/repos?page=3>; rel="next"' } });
  };
  try {
    const service = new GitHubResourceService({ requireOwner: async () => { authorized = true; }, readForExecution: async () => ({ token: "test-token" }) } as never);
    const result = await service.listRepositories("ws", "credential", "user", 2);
    assert.equal(requested, "https://api.github.com/user/repos?per_page=100&sort=updated&page=2");
    assert.equal(result.nextPage, 3);
    assert.equal(JSON.stringify(result).includes("test-token"), false);
    assert.equal(JSON.stringify(result).includes("do-not-return"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("normalizes GitHub repository metadata without carrying provider secrets", () => {
  const [repository] = normalizeGitHubRepository({
    id: 42,
    name: "automation",
    full_name: "acme/automation",
    private: true,
    default_branch: "main",
    owner: { login: "acme" },
    permissions: { admin: true, push: true, pull: true },
    token: "must-not-be-returned",
    webhookSecret: "must-not-be-returned",
  });

  assert.deepEqual(repository, {
    id: 42,
    fullName: "acme/automation",
    name: "automation",
    owner: "acme",
    private: true,
    defaultBranch: "main",
    permissions: { admin: true, push: true, pull: true },
  });
  assert.equal("token" in (repository ?? {}), false);
  assert.equal("webhookSecret" in (repository ?? {}), false);
});

test("returns visible owners and filters repositories by the selected owner", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { id: 1, name: "first", full_name: "ithelpdesk/first", owner: { login: "ithelpdesk" } },
    { id: 2, name: "second", full_name: "phuuthanh-dev/second", owner: { login: "phuuthanh-dev" } },
  ]), { status: 200 });
  try {
    const service = new GitHubResourceService({ requireOwner: async () => undefined, readForExecution: async () => ({ token: "test-token" }) } as never);
    const result = await service.listRepositories("ws", "credential", "user", 1, "ITHELPDESK");
    assert.deepEqual(result.repositories.map((repository) => repository.fullName), ["ithelpdesk/first"]);
    assert.deepEqual(result.repositoryOwners, ["ithelpdesk", "phuuthanh-dev"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("rejects malformed repository owner filters before returning data", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("[]", { status: 200 }); };
  try {
    const service = new GitHubResourceService({ requireOwner: async () => undefined, readForExecution: async () => ({ token: "test-token" }) } as never);
    await assert.rejects(() => service.listRepositories("ws", "credential", "user", 1, "owner/other"), (error: any) => error.response?.code === "INVALID_INPUT");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("drops malformed GitHub repository records", () => {
  assert.deepEqual(normalizeGitHubRepository({ id: "42", full_name: "acme/automation" }), []);
  assert.deepEqual(normalizeGitHubRepository(null), []);
});
