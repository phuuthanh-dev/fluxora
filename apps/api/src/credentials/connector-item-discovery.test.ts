import assert from "node:assert/strict";
import test from "node:test";
import { discoverConnectorItems } from "./connector-item-discovery";
import { ConnectorResourceController } from "./connector-resource.controller";
import { CredentialProvider } from "@prisma/client";
import { executeJira, jiraPickerJql } from "../execution/jira";

const token = "synthetic-resource-token";
const credentials = {
  requireOwner: async () => undefined,
  runJiraOperation: async (_id: string, _workspace: string, operation: () => Promise<unknown>) => operation(),
  readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
    assert.equal(id, "connection"); assert.equal(workspace, "workspace");
    return { token, accessToken: token, cloudId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", region: "de" };
  },
} as never;

test("Jira search sends escaped picker text and returns minimal named keys and cursor", async () => {
  const result = await discoverConnectorItems("jira-issue", "connection", "workspace", { query: "login" }, credentials, async (url, init) => {
    const parsed = new URL(url); assert.match(parsed.pathname, /search\/jql$/); assert.equal(init.method, "GET");
    assert.equal(parsed.searchParams.get("jql"), jiraPickerJql("login")); assert.equal(parsed.searchParams.get("fields"), "summary,status");
    return Response.json({ issues: [{ id: "1", key: "TEST-7", fields: { summary: "Fix login", description: "not returned", creator: { emailAddress: "private@example.test" } } }], nextPageToken: "next" });
  });
  assert.deepEqual(result, { items: [{ id: "TEST-7", name: "TEST-7 · Fix login" }], nextCursor: "next" });
  assert.equal(jiraPickerJql(""), "updated >= -90d order by updated DESC");
  assert.equal(jiraPickerJql("test-7"), 'key = "TEST-7"');
  assert.throws(() => jiraPickerJql("\n"));
});

test("Jira list action validates limits before provider calls and redacts credentials", async () => {
  await assert.rejects(() => executeJira({ limit: 0 }, "search-issues", "live", "workspace", credentials, async () => { throw Error("must not call"); }));
  const result = await executeJira({ credentialId: "connection", query: 'project = TEST', limit: 1 }, "search-issues", "live", "workspace", credentials, async () => Response.json({ issues: [{ id: "1", key: "TEST-7", fields: { summary: token } }], isLast: true }));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
  await assert.rejects(() => discoverConnectorItems("jira-issue", "connection", "workspace", { cursor: "same" }, credentials, async () => Response.json({ issues: [], nextPageToken: "same" })));
});

test("GitLab discovery uses pipeline ID and MR IID, rejects cross-project rows", async () => {
  for (const resource of ["gitlab-pipeline", "gitlab-merge-request"] as const) {
    const result = await discoverConnectorItems(resource, "connection", "workspace", { parent: "42", cursor: "2" }, credentials, async (url) => {
      assert.equal(new URL(url).searchParams.get("page"), "2");
      return Response.json([{ id: 999, iid: 7, project_id: 42, title: "Review", status: "success", ref: "main" }], { headers: { "x-next-page": "3" } });
    });
    assert.equal(result.items[0]?.id, resource === "gitlab-pipeline" ? "999" : "7"); assert.equal(result.nextCursor, "3");
    await assert.rejects(() => discoverConnectorItems(resource, "connection", "workspace", { parent: "42" }, credentials, async () => Response.json([{ id: 999, iid: 7, project_id: 41, title: "Other" }])));
  }
});

test("GitHub label names preserve punctuation, pagination and reject secret echoes", async () => {
  const read = async (url: string, init: RequestInit) => {
    assert.match(url, /repos\/owner\/repo\/labels\?per_page=50&page=2$/); assert.equal(init.headers && (init.headers as Record<string, string>).authorization, `Bearer ${token}`);
    return Response.json([{ name: "type, bug" }], { headers: { link: '<https://api.github.com/repos/owner/repo/labels?page=3>; rel="next"' } });
  };
  assert.deepEqual(await discoverConnectorItems("github-label", "connection", "workspace", { parent: "owner/repo", cursor: "2" }, credentials, read), { items: [{ id: "type, bug", name: "type, bug" }], nextCursor: "3" });
  await assert.rejects(() => discoverConnectorItems("github-label", "connection", "workspace", { parent: "owner/repo" }, credentials, async () => Response.json([{ name: token }])));
  for (const parent of ["../evil", "owner/..", "owner/."]) {
    let contacted = false;
    await assert.rejects(() => discoverConnectorItems("github-label", "connection", "workspace", { parent }, credentials, async () => { contacted = true; throw Error("must not call"); }));
    assert.equal(contacted, false);
  }
});

test("Sentry and Vercel options retain their parent context and continuation", async () => {
  const sentry = await discoverConnectorItems("sentry-issue", "connection", "workspace", { parent: "web", context: "acme" }, credentials, async (url) => {
    assert.equal(new URL(url).pathname, "/api/0/organizations/acme/issues/");
    return Response.json([{ id: "123", shortId: "WEB-1", title: "Error" }], { headers: { link: `<${url}&cursor=0:1:0>; rel="next"; results="true"; cursor="0:1:0"` } });
  });
  assert.equal(sentry.items[0]?.id, "123"); assert.equal(sentry.nextCursor, "0:1:0");
  const vercel = await discoverConnectorItems("vercel-deployment", "connection", "workspace", { parent: "prj_test", context: "personal" }, credentials, async (url) => {
    assert.equal(new URL(url).searchParams.get("projectId"), "prj_test");
    return Response.json({ deployments: [{ uid: "dpl_test", name: "Preview", state: "READY" }], pagination: { next: 123 } });
  });
  assert.equal(vercel.items[0]?.id, "dpl_test"); assert.equal(vercel.nextCursor, "123");
});

test("resource controller checks ownership before discovery and rejects unsupported resources", async () => {
  const request = { currentUser: { id: "intruder" } } as never;
  let lookedUp = false;
  const controller = new ConnectorResourceController({ requireOwner: async () => { throw Error("FORBIDDEN"); }, readForExecution: async () => { lookedUp = true; } } as never);
  await assert.rejects(() => controller.connectorItems("workspace", "connection", "jira-issue", undefined, undefined, undefined, undefined, request), /FORBIDDEN/); assert.equal(lookedUp, false);
  const allowed = new ConnectorResourceController(credentials);
  await assert.rejects(() => allowed.connectorItems("workspace", "connection", "__proto__", undefined, undefined, undefined, undefined, request));
});
