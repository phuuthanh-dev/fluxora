import assert from "node:assert/strict";
import test from "node:test";
import { executeGitLab, listGitLabProjects } from "./gitlab";

const token = "synthetic-gitlab-test-token";
const credentials = { readForExecution: async (id: string, workspace: string, provider: string) => { assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, "GITLAB"); return { token }; } };
const config = { credentialId: "connection", project: "42", issue: "3" };
const issue = { id: 19, iid: 3, project_id: 42, title: "Report", state: "opened", description: "Content" };
const json = (data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { headers });

test("GitLab discovery and reads use scoped credentials, numeric project/issue IDs and bounded pagination", async () => {
  const projects = await listGitLabProjects(token, 2, async (url, init) => { assert.match(url, /membership=true/); assert.match(url, /page=2$/); assert.equal((init.headers as Record<string, string>)["PRIVATE-TOKEN"], token); return json([{ id: 42, path_with_namespace: "team/project" }], { "x-next-page": "3" }); });
  assert.deepEqual(projects, { projects: [{ id: "42", name: "team/project" }], nextPage: 3 });
  const result = await executeGitLab({ ...config, page: 2, pageSize: 1 }, "list-issues", "live", "workspace", credentials as never, async (url) => { assert.match(url, /projects\/42\/issues\?scope=all&state=opened&per_page=1&page=2$/); return json([issue], { "x-next-page": "3" }); });
  assert.deepEqual(result.output, { items: [{ id: 19, iid: 3, projectId: 42, title: "Report", description: "Content", state: "opened" }], nextPage: 3 });
  await assert.rejects(executeGitLab(config, "get-issue", "live", "workspace", credentials as never, async () => json({ ...issue, project_id: 99 })), { code: "INVALID_RESPONSE" });
  await assert.rejects(executeGitLab({ ...config, project: "../other" }, "get-project", "live", "workspace", credentials as never), { code: "INVALID_INPUT" });
  await assert.rejects(executeGitLab(config, "get-project", "live", "workspace", credentials as never, async () => new Response(null, { status: 429, headers: { "retry-after": "3" } })), { code: "HTTP_ERROR", retryable: true, retryAfterMs: 3000 });
});

test("GitLab writes send only selected fields and never automatically retry ambiguous delivery", async () => {
  let writes = 0;
  const read = async (): Promise<Response> => { throw new Error("Unexpected GET"); };
  const created = await executeGitLab({ ...config, title: "Report", description: "Content" }, "create-issue", "live", "workspace", credentials as never, read, async (url, init) => { writes++; assert.equal(url, "https://gitlab.com/api/v4/projects/42/issues"); assert.equal(init.method, "POST"); assert.deepEqual(JSON.parse(String(init.body)), { title: "Report", description: "Content" }); return json({ ...issue, description: `Echo ${token}` }); });
  assert.equal(writes, 1); assert.ok(!JSON.stringify(created).includes(token));
  const comment = await executeGitLab({ ...config, body: "Test comment" }, "add-comment", "live", "workspace", credentials as never, read, async (url, init) => { assert.match(url, /issues\/3\/notes$/); assert.deepEqual(JSON.parse(String(init.body)), { body: "Test comment" }); return json({ id: 8, noteable_iid: 3, noteable_type: "Issue" }); });
  assert.equal(comment.output.commentId, 8);
  for (const response of [new Response(null, { status: 503 }), json({ ...issue, iid: 4 })]) {
    await assert.rejects(executeGitLab({ ...config, body: "Test" }, "add-comment", "live", "workspace", credentials as never, read, async () => response), { code: "DELIVERY_UNCERTAIN", retryable: false });
  }
  await assert.rejects(executeGitLab({ ...config, title: "Test" }, "create-issue", "live", "workspace", credentials as never, read, async () => { throw new Error(token); }), (error: unknown) => !String(error).includes(token) && (error as { retryable: boolean }).retryable === false);
});

test("GitLab simulation does not read a credential or contact the provider", async () => {
  const forbidden = async (): Promise<never> => { throw new Error("No provider calls in simulation"); };
  for (const operation of ["get-project", "list-issues", "get-issue", "create-issue", "add-comment"] as const) {
    const result = await executeGitLab({ ...config, title: "Test", body: "Test" }, operation, "mock", "workspace", { readForExecution: forbidden } as never, forbidden, forbidden);
    assert.equal(result.status, "succeeded");
  }
});
