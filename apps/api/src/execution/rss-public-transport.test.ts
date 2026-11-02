import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicRssUrl, fetchPublicRss, parsePublicRssUrl, rssPublicSocketLookup } from "./rss-public-transport";
import { nodeFailureFromOutboundPolicy } from "./node-failure";

const publicDns = async () => [{ address: "8.8.8.8", family: 4 }];

test("draft URL validation accepts ordinary queries and encoded paths without DNS", () => {
  const url = parsePublicRssUrl("https://feeds.example.test/topics/caf%C3%A9.xml?lang=vi&limit=20");
  assert.equal(url.pathname, "/topics/caf%C3%A9.xml");
  assert.equal(url.searchParams.get("lang"), "vi");
  for (const bad of ["https://user:pass@example.test/rss", "https://example.test/rss?api_key=private", "https://example.test/rss?X-Amz-Signature=private", "https://example.test/%zz", "http://127.0.0.1/rss", "http://[::1]/rss", "https://localhost/rss", "https://example.test/rss#private"]) {
    assert.throws(() => parsePublicRssUrl(bad), (error: unknown) => !String(error).includes("private"));
  }
});

test("RSS checks all resolved addresses even if a host is globally allowlisted", async () => {
  const previous = process.env.OUTBOUND_ALLOWED_HOSTNAMES;
  process.env.OUTBOUND_ALLOWED_HOSTNAMES = "feeds.example.test";
  try {
    await assert.doesNotReject(assertPublicRssUrl("https://feeds.example.test/rss?q=one", publicDns));
    await assert.rejects(assertPublicRssUrl("https://feeds.example.test/rss", async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]));
  } finally { if (previous === undefined) delete process.env.OUTBOUND_ALLOWED_HOSTNAMES; else process.env.OUTBOUND_ALLOWED_HOSTNAMES = previous; }
});

test("socket DNS rechecks the resolved address and rejects a private rebound", async () => {
  const lookup = rssPublicSocketLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
  await new Promise<void>((resolve, reject) => {
    lookup("feeds.example.test", { family: 4, all: false }, (error) => error ? resolve() : reject(new Error("private socket address was accepted")));
  });
});

test("transient DNS failures can be retried without exposing resolver details", async () => {
  await assert.rejects(assertPublicRssUrl("https://feeds.example.test/rss", async () => { throw new Error("internal resolver detail"); }), (error: unknown) => {
    const failure = nodeFailureFromOutboundPolicy(error);
    return failure.retryable && !failure.message.includes("internal resolver detail");
  });
});

test("RSS follows bounded same-origin redirects while retaining regular queries", async () => {
  const visited: string[] = [];
  const transport = (async (input: string | URL | Request, init?: RequestInit) => {
    visited.push(String(input));
    assert.equal(init?.redirect, "manual");
    return visited.length === 1 ? new Response(null, { status: 302, headers: { location: "/feed.xml?lang=vi" } }) : new Response("feed");
  }) as typeof fetch;
  const response = await fetchPublicRss("https://feeds.example.test/start", { method: "GET" }, { resolver: publicDns, fetchImplementation: transport });
  assert.equal(await response.text(), "feed");
  assert.deepEqual(visited, ["https://feeds.example.test/start", "https://feeds.example.test/feed.xml?lang=vi"]);
});

test("a timeout between redirects remains retryable and is not classified as a policy block", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(fetchPublicRss("https://feeds.example.test/start", { signal: controller.signal }, {
    resolver: publicDns,
    fetchImplementation: (async () => {
      calls++;
      controller.abort(new DOMException("Timed out", "TimeoutError"));
      return new Response(null, { status: 302, headers: { location: "/again" } });
    }) as typeof fetch,
  }), (error: unknown) => {
    const failure = nodeFailureFromOutboundPolicy(error);
    return failure.code === "TIMEOUT" && failure.retryable;
  });
  assert.equal(calls, 1);
});

test("RSS rejects cross-origin, secret-bearing and excessive redirects without exposing locations", async () => {
  for (const location of ["https://other.example.test/rss", "/rss?token=private"]) {
    await assert.rejects(fetchPublicRss("https://feeds.example.test/start", {}, { resolver: publicDns, fetchImplementation: (async () => new Response(null, { status: 302, headers: { location } })) as typeof fetch }), (error: unknown) => !String(error).includes("private"));
  }
  let calls = 0;
  await assert.rejects(fetchPublicRss("https://feeds.example.test/start", {}, { resolver: publicDns, fetchImplementation: (async () => { calls++; return new Response(null, { status: 302, headers: { location: "/again" } }); }) as typeof fetch }));
  assert.equal(calls, 6);
});
