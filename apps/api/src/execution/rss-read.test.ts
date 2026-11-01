import { strict as assert } from "node:assert";
import { test } from "node:test";
import { executeRssRead, parseRssFeed } from "./rss-read";

test("RSS and Atom entries normalize and respect the configured limit", () => {
  const rss = parseRssFeed('<rss version="2.0"><channel><title>News &amp; notes</title><item><title>First</title><link>https://example.test/a</link><guid>abc</guid></item><item><title>Second</title></item></channel></rss>', 1);
  assert.equal(rss.title, "News & notes");
  assert.equal(rss.items.length, 1);
  assert.equal(rss.items[0]?.link, "https://example.test/a");
  const atom = parseRssFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Updates</title><entry><id>x</id><title>News</title><link rel="self" href="https://example.test/feed"/><link rel="alternate" href="https://example.test/post"/></entry></feed>', 20);
  assert.equal(atom.items[0]?.link, "https://example.test/post");
});

test("untrusted XML, oversized responses and invalid inputs fail safely", async () => {
  assert.throws(() => parseRssFeed('<!DOCTYPE rss [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss><channel><title>&a;</title></channel></rss>', 1), /unsupported XML/);
  assert.throws(() => parseRssFeed("<html></html>", 1), /Expected an RSS/);
  await assert.rejects(executeRssRead({ url: "https://example.test/feed", limit: 101 }, "mock"), /limit between/);
  await assert.rejects(executeRssRead({ url: "https://example.test/feed" }, "live", async () => new Response("x".repeat(1_000_001))), /size limit/);
  await assert.rejects(executeRssRead({ url: "https://example.test/feed" }, "live", async () => new Response("", { status: 429 })), (error: unknown) => !!error && typeof error === "object" && "retryable" in error && error.retryable === true);
  assert.throws(() => parseRssFeed(`<rss><channel>${"<a>".repeat(40)}${"</a>".repeat(40)}</channel></rss>`, 1), /unsupported XML/);
  const result = await executeRssRead({ url: "https://example.test/feed" }, "live", async () => new Response("<rss><channel><title>Feed</title></channel></rss>"));
  assert.deepEqual(result.output, { title: "Feed", items: [] });
});
