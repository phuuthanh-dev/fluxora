import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubRepository } from "./github-resource.service";

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

test("drops malformed GitHub repository records", () => {
  assert.deepEqual(normalizeGitHubRepository({ id: "42", full_name: "acme/automation" }), []);
  assert.deepEqual(normalizeGitHubRepository(null), []);
});
