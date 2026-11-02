import assert from "node:assert/strict";
import test from "node:test";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { GoogleResourceService } from "./google-resource.service";

type FakeFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

// Exercise the production redirect policy without DNS or network access.
function createService(credentials: unknown, fakeFetch: FakeFetch) {
  class SyntheticGoogleResourceService extends GoogleResourceService {
    protected override sheetsFetch: typeof fetchSafeOutbound = (url, init) => fetchSafeOutbound(url, init, {
      resolveHost: async () => ["8.8.8.8"],
      fetchImplementation: fakeFetch,
    });
  }
  return new SyntheticGoogleResourceService(credentials as never);
}

const authorizedCredentials = { requireOwner: async () => {}, readGoogleForExecution: async () => ({ accessToken: "synthetic" }) };
const unexpectedFetch: FakeFetch = async () => { throw new Error("unexpected provider call"); };

test("Sheets discovery is owner and workspace scoped and returns bounded tab metadata", async () => {
  const calls: string[] = [];
  let requestUrl = "";
  let authorization = "";
  let redirect: RequestInit["redirect"];
  const service = createService({
    requireOwner: async (workspace: string, user: string) => { calls.push(`owner:${workspace}:${user}`); },
    readGoogleForExecution: async (credential: string, workspace: string) => { calls.push(`credential:${workspace}:${credential}`); return { accessToken: "synthetic-token", refreshToken: "synthetic-refresh" }; },
  }, async (input, init) => {
    calls.push("fetch");
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    redirect = init?.redirect;
    return Response.json({ sheets: Array.from({ length: 101 }, (_, i) => ({ properties: { sheetId: i, title: `Tab ${i}`, secret: "do-not-return" } })) });
  });
  const result = await service.listSheetTabs("workspace-1", "credential-1", "owner-1", "book-1");
  const url = new URL(requestUrl);
  assert.deepEqual(calls, ["owner:workspace-1:owner-1", "credential:workspace-1:credential-1", "fetch"]);
  assert.equal(url.origin, "https://sheets.googleapis.com");
  assert.equal(url.pathname, "/v4/spreadsheets/book-1");
  assert.equal(url.searchParams.get("fields"), "sheets(properties(sheetId,title))");
  assert.equal(authorization, "Bearer synthetic-token");
  assert.equal(redirect, "manual");
  assert.equal(result.tabs.length, 100);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.tabs[0], { id: 0, title: "Tab 0" });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token|synthetic-refresh|do-not-return/);
});

test("Sheets headers read only the first 100 columns and preserve ambiguous labels and positions", async () => {
  let requestUrl = "";
  const service = createService(authorizedCredentials, async (input) => {
    requestUrl = String(input);
    return Response.json({ values: [["Name", "", "Name"]], ignored: "private" });
  });
  const result = await service.getSheetHeaders("ws", "cred", "user", "book-1", "Bob's tab");
  const url = new URL(requestUrl);
  assert.equal(decodeURIComponent(url.pathname), "/v4/spreadsheets/book-1/values/'Bob''s tab'!A1:CV1");
  assert.equal(url.searchParams.get("fields"), "values");
  assert.deepEqual(result, { headers: [{ column: 1, name: "Name" }, { column: 2, name: "" }, { column: 3, name: "Name" }], columnLimit: 100 });
});

test("Sheets discovery refuses expressions and denies access before reading a connection", async () => {
  let accessed = false;
  const service = createService({
    requireOwner: async () => { throw new Error("owner denied"); },
    readGoogleForExecution: async () => { accessed = true; return {}; },
  }, unexpectedFetch);
  await assert.rejects(service.listSheetTabs("ws", "cred", "other", "book"), /owner denied/);
  assert.equal(accessed, false);
  await assert.rejects(service.listSheetTabs("ws", "cred", "user", "{{ steps.book }}"), /literal spreadsheet ID/);
  await assert.rejects(service.getSheetHeaders("ws", "cred", "user", "book", "{{ steps.sheet }}"), /literal sheet tab name/);
});

test("Sheets discovery sanitizes denial, malformed and oversized responses", async () => {
  let response: Response = new Response("private provider details", { status: 403 });
  const service = createService(authorizedCredentials, async () => response);
  await assert.rejects(service.listSheetTabs("ws", "cred", "user", "book"), (error: unknown) => {
    const detail = (error as { getResponse: () => { code: string; message: string } }).getResponse();
    assert.equal(detail.code, "GOOGLE_SHEETS_DISCOVERY_DENIED");
    assert.match(detail.message, /manually.*expression/);
    assert.doesNotMatch(detail.message, /private provider details/);
    return true;
  });
  response = Response.json({ values: [["x".repeat(257)]] });
  await assert.rejects(service.getSheetHeaders("ws", "cred", "user", "book", "Sheet1"), /oversized headers/);
  response = new Response("x".repeat(1_000_001));
  await assert.rejects(service.listSheetTabs("ws", "cred", "user", "book"), /oversized metadata/);
  response = Response.json({ values: [["header"], ["data"]] });
  await assert.rejects(service.getSheetHeaders("ws", "cred", "user", "book", "Sheet1"), /invalid headers/);
});

test("Sheets discovery does not fetch if the connection is outside the workspace", async () => {
  let fetched = false;
  const service = createService({
    requireOwner: async () => {},
    readGoogleForExecution: async (_credential: string, workspace: string) => { assert.equal(workspace, "workspace-2"); throw new Error("credential not found"); },
  }, async () => { fetched = true; throw new Error("unexpected provider call"); });
  await assert.rejects(service.getSheetHeaders("workspace-2", "other-workspace-credential", "owner", "book", "Sheet1"), /credential not found/);
  assert.equal(fetched, false);
});

test("Sheets discovery follows same-origin redirects manually", async () => {
  const requests: Array<{ url: string; authorization: string | null; redirect: RequestInit["redirect"] }> = [];
  const service = createService(authorizedCredentials, async (input, init) => {
    requests.push({ url: String(input), authorization: new Headers(init?.headers).get("Authorization"), redirect: init?.redirect });
    return requests.length === 1
      ? new Response(null, { status: 302, headers: { location: "/v4/spreadsheets/book?fields=sheets(properties(sheetId,title))" } })
      : Response.json({ sheets: [{ properties: { sheetId: 1, title: "Sheet1" } }] });
  });
  assert.deepEqual(await service.listSheetTabs("ws", "cred", "user", "book"), { tabs: [{ id: 1, title: "Sheet1" }], hasMore: false });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => new URL(request.url).origin === "https://sheets.googleapis.com" && request.redirect === "manual" && request.authorization === "Bearer synthetic"));
});

test("Sheets discovery never sends credentials to cross-origin or private redirect targets", async () => {
  for (const location of ["https://other.example/collect", "http://127.0.0.1/private"]) {
    const requests: Array<{ url: string; authorization: string | null; redirect: RequestInit["redirect"] }> = [];
    const service = createService(authorizedCredentials, async (input, init) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get("Authorization"), redirect: init?.redirect });
      return new Response(null, { status: 302, headers: { location } });
    });
    await assert.rejects(service.getSheetHeaders("ws", "cred", "user", "book", "Sheet1"), (error: unknown) => {
      const detail = (error as { getResponse: () => { code: string; message: string } }).getResponse();
      assert.equal(detail.code, "GOOGLE_SHEETS_DISCOVERY_UNAVAILABLE");
      assert.match(detail.message, /manually.*expression/);
      assert.doesNotMatch(detail.message, /other\.example|127\.0\.0\.1|synthetic/);
      return true;
    });
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0]!.url).origin, "https://sheets.googleapis.com");
    assert.equal(requests[0]!.authorization, "Bearer synthetic");
    assert.equal(requests[0]!.redirect, "manual");
  }
});

test("Sheets discovery stops redirect loops with sanitized guidance", async () => {
  let requests = 0;
  const service = createService(authorizedCredentials, async () => { requests++; return new Response(null, { status: 302, headers: { location: "/loop" } }); });
  await assert.rejects(service.listSheetTabs("ws", "cred", "user", "book"), /could not be loaded/);
  assert.equal(requests, 6);
});
