import assert from "node:assert/strict";
import test from "node:test";
import { executeJira, listJiraProjects, listJiraIssueTypes } from "./jira";
import { NodeFailure } from "./node-failure";

const credential = { accessToken: "synthetic-jira-token", cloudId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const reads: unknown[][] = [];
const credentials = { readForExecution: async (...args: unknown[]) => { reads.push(args); return credential; }, runJiraOperation: async (_id: string, _workspace: string, operation: () => Promise<unknown>) => operation() } as never;
const create = { credentialId: "connection", project: "10001", issueType: "10002", summary: "Test issue", description: "Example" };
test("Jira creates an issue in the selected site with ADF text", async () => {
  const result = await executeJira(create, "create-issue", "live", "workspace", credentials, async () => { throw Error("unexpected"); }, async (url, init) => {
    assert.equal(url, `https://api.atlassian.com/ex/jira/${credential.cloudId}/rest/api/3/issue`);
    assert.equal(init.method, "POST");
    const body = JSON.parse(String(init.body)); assert.deepEqual(body.fields.project, { id: "10001" }); assert.equal(body.fields.description.type, "doc");
    return Response.json({ id: "123", key: "DEMO-1" });
  });
  assert.deepEqual(result.output, { issue: { id: "123", key: "DEMO-1" } });
  assert.equal(reads.at(-1)?.[1], "workspace");
});
test("Jira never retries ambiguous writes and checks returned issue identity", async () => {
  await assert.rejects(() => executeJira(create, "create-issue", "live", "workspace", credentials, async () => { throw Error(); }, async () => { throw Error("connection lost"); }), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable);
  await assert.rejects(() => executeJira({ credentialId: "connection", issue: "DEMO-1" }, "get-issue", "live", "workspace", credentials, async () => Response.json({ id: "123", key: "OTHER-1", fields: {} })), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_RESPONSE");
  const result = await executeJira({ credentialId: "connection", issue: "DEMO-1" }, "get-issue", "live", "workspace", credentials, async () => Response.json({ id: "123", key: "DEMO-1", fields: { summary: "synthetic-jira-token" } }));
  assert.doesNotMatch(JSON.stringify(result), /synthetic-jira-token/);
});
test("Jira updates and comments with fixed API routes", async () => {
  const update = await executeJira({ credentialId: "connection", issue: "DEMO-1", summary: "Updated" }, "update-issue", "live", "workspace", credentials, undefined, async (url, init) => { assert.match(url, /issue\/DEMO-1$/); assert.equal(init.method, "PUT"); return new Response(null, { status: 204 }); });
  assert.deepEqual(update.output, { issue: { key: "DEMO-1", updated: true } });
  const comment = await executeJira({ credentialId: "connection", issue: "DEMO-1", comment: "Hello" }, "add-comment", "live", "workspace", credentials, undefined, async (url, init) => { assert.match(url, /issue\/DEMO-1\/comment$/); assert.equal(JSON.parse(String(init.body)).body.type, "doc"); return Response.json({ id: "12" }); });
  assert.deepEqual(comment.output, { issueKey: "DEMO-1", commentId: "12" });
});

test("Jira discovery lists only scoped projects and non-subtask issue types", async () => {
  const projects = await listJiraProjects("connection", "workspace", credentials, async (url) => { assert.match(url, /project\/search/); return Response.json({ values: [{ id: "1", name: "Project" }], isLast: true }); });
  assert.deepEqual(projects.projects, [{ id: "1", name: "Project" }]);
  const types = await listJiraIssueTypes("connection", "workspace", "1", credentials, async (url) => { assert.match(url, /createmeta\/1\/issuetypes/); return Response.json({ issueTypes: [{ id: "2", name: "Task" }, { id: "3", name: "Subtask", subtask: true }], total: 2 }); });
  assert.deepEqual(types.issueTypes, [{ id: "2", name: "Task" }]);
});
