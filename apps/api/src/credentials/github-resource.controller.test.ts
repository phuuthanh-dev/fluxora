import assert from "node:assert/strict";
import test from "node:test";
import { GitHubResourceController } from "./github-resource.controller";

test("GitHub repository owner query is validated before the resource service", async () => {
  let calls = 0;
  const controller = new GitHubResourceController({ listRepositories: async (...args: unknown[]) => { calls += 1; return args; } } as never);
  await assert.rejects(
    () => controller.repositories("workspace", "credential", { currentUser: { id: "user" } } as never, undefined, "owner/other"),
    (error: any) => error.response?.code === "INVALID_INPUT",
  );
  assert.equal(calls, 0);
});

test("GitHub repository owner query is forwarded without changing the credential boundary", async () => {
  const controller = new GitHubResourceController({ listRepositories: async (...args: unknown[]) => args } as never);
  const result = await controller.repositories("workspace", "credential", { currentUser: { id: "user" } } as never, "2", "ithelpdesk");
  assert.deepEqual(result, ["workspace", "credential", "user", 2, "ithelpdesk"]);
});
