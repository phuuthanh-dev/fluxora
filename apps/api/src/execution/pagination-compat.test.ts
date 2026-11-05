import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeGoogleDrive, executeNode, mockDrive } from "./execution.service";
import type { WorkflowNode, WorkflowNodeType } from "@workflow/contracts";
import { executeGmailRead, listGmailMessages } from "./gmail-read";
import { executeNotionSearch, searchNotionPages } from "./notion-search";
import { executeSentryListIssues } from "./sentry";
import { executeVercelListDeployments } from "./vercel";
import { redactValue } from "./redaction";
import { liveCredentialRequirements } from "./live-readiness";
import { NodeFailure } from "./node-failure";

const synthetic = { readForExecution: async (_id: string, _workspace: string, provider: CredentialProvider) => {
  if (provider === CredentialProvider.NOTION) return { token: "synthetic" };
  if (provider === CredentialProvider.SENTRY) return { token: "synthetic", region: "global" };
  if (provider === CredentialProvider.VERCEL) return { token: "synthetic" };
  throw new Error("unexpected credential provider");
}, readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as unknown as CredentialService;

test("legacy Gmail ignores a saved page token and retains request and output", async () => {
  let seen = "";
  const transport = async (url: string | URL | Request) => { seen = String(url); return Response.json({ messages: [], nextPageToken: "" }); };
  const page = await listGmailMessages("synthetic", "in:inbox", 5, transport as never, undefined, 1);
  assert.equal(new URL(seen).searchParams.has("pageToken"), false);
  assert.deepEqual(page, { messages: [], count: 0, hasMore: false });
  const mock = await executeGmailRead({ pageToken: { ignored: true } }, "mock", "workspace", synthetic, undefined, 1);
  assert.equal(Object.hasOwn(mock.output, "nextPageToken"), false);
  await assert.rejects(executeGmailRead({ pageToken: { invalid: true } }, "mock", "workspace", synthetic, undefined, 2));
});

test("Gmail and Drive v2 reject unresolved filters before accessing credentials", async () => {
  const noCredential = { readForExecution: () => { throw new Error("credential must not be read"); }, readGoogleForExecution: () => { throw new Error("credential must not be read"); } } as never;
  for (const config of [{ query: undefined }, { query: null }, { limit: undefined }, { mailbox: undefined }]) {
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(executeGmailRead(config, mode, "workspace", noCredential, undefined, 2), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
    }
  }
  for (const config of [{ operation: undefined }, { operation: "unknown" }, { operation: "search", query: undefined }, { operation: "search", query: null }]) {
    const node: WorkflowNode = { id: "drive", type: "action.google-drive.v2", config, position: { x: 0, y: 0 } };
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(executeNode(node, config, {}, mode, "workspace", noCredential, "execution"), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
    }
  }
  assert.equal((await executeGmailRead({ query: undefined }, "mock", "workspace", noCredential, undefined, 1)).status, "succeeded");
  const legacy: WorkflowNode = { id: "drive", type: "action.google-drive", config: {}, position: { x: 0, y: 0 } };
  assert.equal((await executeNode(legacy, { operation: "unknown" }, {}, "mock", "workspace", noCredential, "execution")).status, "succeeded");
});

test("Notion legacy ignores cursor and accepts the old receipt contract", async () => {
  let body: Record<string, unknown> = {};
  const search: typeof searchNotionPages = (input) => searchNotionPages(input, async (_url, init) => {
    body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return Response.json({ results: [], has_more: false, next_cursor: "legacy-opaque" });
  });
  const result = await executeNotionSearch({ credentialId: "n", cursor: { ignored: true } }, "live", "workspace", synthetic, search, 1);
  assert.equal(Object.hasOwn(body, "start_cursor"), false);
  assert.deepEqual(result.output, { pages: [], hasMore: false, nextCursor: "legacy-opaque" });
  await assert.rejects(executeNotionSearch({ credentialId: "n", cursor: { ignored: true } }, "live", "workspace", synthetic, search, 2));
});

test("Notion v2 rejects unresolved pagination and search expressions while legacy behavior remains", async () => {
  const noCredential = { readForExecution: () => { throw new Error("credential must not be read"); } } as never;
  for (const config of [{ cursor: undefined }, { pageSize: undefined }, { query: undefined }, { query: null }, { cursor: null }]) {
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(executeNotionSearch(config, mode, "workspace", noCredential, undefined, 2), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
    }
  }
  const old = await executeNotionSearch({ cursor: undefined, query: undefined, pageSize: undefined }, "mock", "workspace", noCredential, undefined, 1);
  assert.equal(old.status, "succeeded");
  const cleared = await executeNotionSearch({ cursor: "", query: "" }, "mock", "workspace", noCredential, undefined, 2);
  assert.equal(cleared.status, "succeeded");
});

test("Sentry and Vercel v2 reject unresolved cursors and filters without changing legacy behavior", async () => {
  const noCredential = { readForExecution: () => { throw new Error("credential must not be read"); } } as never;
  const cases = [
    { base: { organization: "example", project: "app" }, run: executeSentryListIssues, bad: [{ cursor: undefined }, { cursor: null }, { limit: undefined }, { status: undefined }] },
    { base: { project: "prj_example" }, run: executeVercelListDeployments, bad: [{ cursor: undefined }, { cursor: null }, { limit: undefined }, { team: undefined }, { team: null }] },
  ];
  for (const { base, run, bad } of cases) {
    for (const input of bad) {
      for (const mode of ["mock", "live"] as const) {
        await assert.rejects(run({ ...base, ...input }, mode, "workspace", noCredential, undefined, 2), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
      }
    }
    assert.equal((await run({ ...base, cursor: null }, "mock", "workspace", noCredential, undefined, 1)).status, "succeeded");
    assert.equal((await run({ ...base, cursor: "" }, "mock", "workspace", noCredential, undefined, 2)).status, "succeeded");
  }
});

test("Sentry and Vercel legacy requests ignore cursor and return the old output keys", async () => {
  const sentryConfig = { credentialId: "s", organization: "org", project: "proj", cursor: "123:0:1" };
  let sentryUrl = "";
  const sentry = await executeSentryListIssues(sentryConfig, "live", "workspace", synthetic, async (url) => { sentryUrl = url; return Response.json([]); }, 1);
  assert.equal(new URL(sentryUrl).searchParams.has("cursor"), false);
  assert.deepEqual(sentry.output, { issues: [], hasMore: false });
  await executeSentryListIssues(sentryConfig, "live", "workspace", synthetic, async (url) => { assert.equal(new URL(url).searchParams.get("cursor"), "123:0:1"); return Response.json([]); }, 2);
  const vercelConfig = { credentialId: "v", team: "personal", project: "prj_abc", cursor: "123" };
  let vercelUrl = "";
  const vercel = await executeVercelListDeployments(vercelConfig, "live", "workspace", synthetic, async (url) => { vercelUrl = url; return Response.json({ deployments: [], pagination: { next: null } }); }, 1);
  assert.equal(new URL(vercelUrl).searchParams.has("until"), false);
  assert.deepEqual(vercel.output, { deployments: [], hasMore: false });
  await executeVercelListDeployments(vercelConfig, "live", "workspace", synthetic, async (url) => { assert.equal(new URL(url).searchParams.get("until"), "123"); return Response.json({ deployments: [], pagination: { next: null } }); }, 2);
});

test("Drive legacy keeps its list/search URL and new type adds pagination; both keep write/read paths", async () => {
  const previous = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); requests.push({ url, method: init?.method ?? "GET" });
      if (url.includes("alt=media")) return new Response("file contents");
      if (url.includes("uploadType=multipart")) return Response.json({ id: "example-id", name: "report", mimeType: "text/plain" });
      return Response.json({ files: [{ id: "first" }], nextPageToken: "next" });
    }) as typeof fetch;
    const credential = { accessToken: "synthetic" };
    const config = { operation: "search", query: "name contains 'x'", pageToken: "saved" };
    const legacy = await executeGoogleDrive(credential, config, false);
    const oldUrl = new URL(requests[0]!.url);
    assert.equal(oldUrl.searchParams.has("pageToken"), false); assert.equal(oldUrl.searchParams.has("pageSize"), false);
    assert.deepEqual(legacy, { operation: "search", files: [{ id: "first" }] });
    const modern = await executeGoogleDrive(credential, config, true);
    assert.equal(new URL(requests[1]!.url).searchParams.get("pageToken"), "saved");
    assert.equal((redactValue(modern) as { nextPageToken: string }).nextPageToken, "next");
    for (const paginated of [false, true]) {
      assert.deepEqual(await executeGoogleDrive(credential, { operation: "downloadText", fileId: "abc" }, paginated), { operation: "downloadText", file: { id: "abc", text: "file contents" } });
      const upload = await executeGoogleDrive(credential, { operation: "uploadText", name: "report", text: "synthetic" }, paginated);
      assert.equal(upload.operation, "uploadText");
      assert.equal(Object.hasOwn(mockDrive({ operation: "search" }, paginated), "nextPageToken"), paginated);
    }
    assert.equal(requests.filter((entry) => entry.method === "POST").length, 2);
  } finally { globalThis.fetch = previous; }
});

test("new Drive and other pagination types require the correct owner credentials", () => {
  const types = ["action.google-drive.v2", "action.gmail.read.v2", "action.notion.search-pages.v2", "action.sentry.list-issues.v2", "action.vercel.list-deployments.v2"] as const;
  const graph = { nodes: types.map((type, index) => ({ id: String(index), type, position: { x: index, y: 0 }, config: { credentialId: "synthetic" } })), edges: [] };
  assert.deepEqual(liveCredentialRequirements(graph).map((row) => row.provider), [CredentialProvider.GOOGLE, CredentialProvider.GMAIL, CredentialProvider.NOTION, CredentialProvider.SENTRY, CredentialProvider.VERCEL]);
});

test("Drive upload failures are not automatically repeated for either type", async () => {
  const previous = globalThis.fetch;
  try {
    for (const version of [false, true]) {
      let calls = 0;
      globalThis.fetch = (async () => { calls++; throw new Error("synthetic network loss"); }) as typeof fetch;
      await assert.rejects(executeGoogleDrive({ accessToken: "synthetic" }, { operation: "uploadText", name: "report", text: "x" }, version), (error: unknown) => {
        const failure = error as { retryable?: boolean };
        assert.equal(failure.retryable, false); return true;
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = previous; }
});


test("the graph dispatcher selects legacy semantics from the node type, including mock runs", async () => {
  const cases: Array<[WorkflowNodeType, Record<string, unknown>]> = [
    ["action.google-drive", { operation: "list", pageToken: null }],
    ["action.gmail.read", { pageToken: null }],
    ["action.notion.search-pages", { cursor: null }],
    ["action.sentry.list-issues", { organization: "org", project: "proj", cursor: {} }],
    ["action.vercel.list-deployments", { project: "prj_abc", cursor: {} }],
  ];
  for (const [type, config] of cases) {
    const node: WorkflowNode = { id: "node", type, position: { x: 0, y: 0 }, config };
    const result = await executeNode(node, config, {}, "mock", "workspace", synthetic, "execution");
    assert.equal(result.status, "succeeded");
    const modern = { ...node, type: `${type}.v2` as WorkflowNodeType };
    await assert.rejects(executeNode(modern, config, {}, "mock", "workspace", synthetic, "execution"));
  }
});
