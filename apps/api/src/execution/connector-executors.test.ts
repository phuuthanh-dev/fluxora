import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { WorkflowNodeType } from "@workflow/contracts";
import { executeNode } from "./execution.service";

test("Notion page creation is dispatched in mock mode without credentials", async () => {
  const config = { parentPageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Example", content: "" };
  const credentials = { readForExecution: () => { throw new Error("mock accessed credentials"); } } as never;
  const result = await executeNode({ id: "page", type: "action.notion.create-page", config, position: { x: 0, y: 0 } }, config, {}, "mock", "workspace", credentials, "execution");
  assert.equal(result.output.parentPageId, config.parentPageId);
  const update = { pageId: config.parentPageId, title: "Updated" };
  const renamed = await executeNode({ id: "rename", type: "action.notion.update-title", config: update, position: { x: 0, y: 0 } }, update, {}, "mock", "workspace", credentials, "execution");
  assert.deepEqual(renamed.output, { pageId: update.pageId, updatedField: "title" });
});

test("GitHub issue update is dispatched in mock mode without credentials", async () => {
  const config = { repository: "owner/repo", issueNumber: "42", field: "state", state: "closed" };
  const credentials = { readForExecution: () => { throw new Error("mock accessed credentials"); } } as never;
  const result = await executeNode({ id: "issue", type: "action.github.update-issue", config, position: { x: 0, y: 0 } }, config, {}, "mock", "workspace", credentials, "execution");
  assert.deepEqual(result.output, { repository: "owner/repo", issueNumber: 42, updatedField: "state" });
});

test("live registry dispatch uses the selected workspace connection and pagination", async () => {
  const originalFetch = globalThis.fetch;
  const originalAllowed = process.env.OUTBOUND_ALLOWED_HOSTNAMES;
  const calls: Array<{ url: URL; method: string }> = [];
  const reads: Array<{ id: string; workspace: string; provider: string }> = [];
  const pageId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const cardId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  process.env.OUTBOUND_ALLOWED_HOSTNAMES = "api.github.com,api.notion.com,api.trello.com,www.googleapis.com,generativelanguage.googleapis.com";
  const credentials = {
    readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
      reads.push({ id, workspace, provider });
      if (provider === CredentialProvider.GITHUB) return { token: "github-synthetic-secret" };
      if (provider === CredentialProvider.NOTION) return { token: "notion-synthetic-secret" };
      if (provider === CredentialProvider.TRELLO) return { apiKey: "trello-synthetic-key", token: "trello-synthetic-token" };
      if (provider === CredentialProvider.GEMINI) return { apiKey: "gemini-synthetic-key" };
      throw new Error("Unexpected credential provider");
    },
    readGoogleForExecution: async (id: string, workspace: string) => { reads.push({ id, workspace, provider: "GOOGLE" }); return { accessToken: "google-synthetic-token" }; },
  } as never;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET" });
    assert.doesNotMatch(url.href, /synthetic-(token|secret|key)/);
    const headers = new Headers(init?.headers);
    if (url.hostname === "api.github.com") assert.equal(headers.get("authorization"), "Bearer github-synthetic-secret");
    if (url.hostname === "api.notion.com") assert.equal(headers.get("authorization"), "Bearer notion-synthetic-secret");
    if (url.hostname === "api.trello.com") assert.match(headers.get("authorization") ?? "", /trello-synthetic-token/);
    if (url.hostname === "www.googleapis.com") assert.equal(headers.get("authorization"), "Bearer google-synthetic-token");
    if (url.hostname === "generativelanguage.googleapis.com") assert.equal(headers.get("x-goog-api-key"), "gemini-synthetic-key");
    if (url.hostname === "api.github.com" && url.pathname === "/repos/example/repo/issues") return Response.json([]);
    if (url.hostname === "api.notion.com" && url.pathname === `/v1/pages/${pageId}`) return Response.json({ object: "page", id: pageId, properties: {} });
    if (url.hostname === "api.trello.com" && url.pathname === `/1/cards/${cardId}`) return Response.json({ id: cardId, name: "Example", desc: "", idBoard: "aaaaaaaaaaaaaaaaaaaaaaaa", idList: "cccccccccccccccccccccccc", closed: false, url: "https://trello.com/c/example" });
    if (url.hostname === "www.googleapis.com" && url.pathname === "/drive/v3/files") return Response.json({ files: [], nextPageToken: "synthetic-page" });
    if (url.hostname === "generativelanguage.googleapis.com" && url.pathname === "/v1beta/models/example:generateContent") return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] }, finishReason: "STOP" }] });
    throw new Error("Unexpected outbound request");
  }) as typeof fetch;
  const run = (type: WorkflowNodeType, config: Record<string, unknown>) => executeNode({ id: "node", type, config, position: { x: 0, y: 0 } }, config, {}, "live", "synthetic-workspace", credentials, "synthetic-execution");
  try {
    const github = await run("action.github.list-issues", { credentialId: "github", repository: "example/repo", state: "open", page: 2, pageSize: 5 });
    const notion = await run("action.notion.retrieve-page", { credentialId: "notion", pageId });
    const trello = await run("action.trello.get-card", { credentialId: "trello", cardId });
    const current = await run("action.google-drive", { credentialId: "google", operation: "list", pageToken: "next-page" });
    const ai = await run("action.gemini", { credentialId: "gemini", model: "example", prompt: "Hello", outputSchema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } });
    assert.deepEqual(reads, [
      { id: "github", workspace: "synthetic-workspace", provider: "GITHUB" },
      { id: "notion", workspace: "synthetic-workspace", provider: "NOTION" },
      { id: "trello", workspace: "synthetic-workspace", provider: "TRELLO" },
      { id: "google", workspace: "synthetic-workspace", provider: "GOOGLE" },
      { id: "gemini", workspace: "synthetic-workspace", provider: "GEMINI" },
    ]);
    assert.equal(calls.length, 5);
    assert.equal(calls[0]?.url.searchParams.get("page"), "2");
    assert.equal(calls[3]?.url.searchParams.get("pageToken"), "next-page");
    assert.equal(current.output.nextPageToken, "synthetic-page");
    assert.deepEqual(ai.output.json, { answer: "ok" });
    assert.doesNotMatch(JSON.stringify([github.output, notion.output, trello.output, current.output, ai.output]), /synthetic-(token|secret|key)/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAllowed === undefined) delete process.env.OUTBOUND_ALLOWED_HOSTNAMES;
    else process.env.OUTBOUND_ALLOWED_HOSTNAMES = originalAllowed;
  }
});
