import assert from "node:assert/strict";
import test from "node:test";
import { parseRssTriggerSnapshot, safeRssItemLink } from "./rss-trigger-snapshot";

const feed = (items: string) => `<rss version="2.0"><channel><title>Example</title>${items}</channel></rss>`;

test("RSS item identity follows GUID and survives title edits and numeric-leading zeros", () => {
  const first = parseRssTriggerSnapshot(feed("<item><guid>001</guid><title>First</title></item>"));
  const edited = parseRssTriggerSnapshot(feed("<item><guid>001</guid><title>Updated</title></item>"));
  const other = parseRssTriggerSnapshot(feed("<item><guid>1</guid><title>First</title></item>"));
  assert.equal(first.keys[0], edited.keys[0]);
  assert.notEqual(first.keys[0], other.keys[0]);
});

test("RSS link and content identities are stable and distinct", () => {
  const result = parseRssTriggerSnapshot(feed("<item><title>Linked</title><link>https://example.test/item?q=1</link></item><item><title>Anonymous item</title><description>Text</description></item>"));
  assert.equal(result.observations.length, 2);
  assert.notEqual(result.keys[0], result.keys[1]);
  assert.equal(result.observations[0]?.item.link, "https://example.test/item?q=1");
});

test("RSS snapshot rejects duplicate, missing and excessive identities", () => {
  assert.throws(() => parseRssTriggerSnapshot(feed("<item><guid>same</guid></item><item><guid>same</guid></item>")));
  assert.throws(() => parseRssTriggerSnapshot(feed("<item><description></description></item>")));
  assert.throws(() => parseRssTriggerSnapshot(feed(Array.from({ length: 101 }, (_, i) => `<item><guid>${i}</guid></item>`).join(""))));
});

test("RSS preserves ordinary link queries while omitting recognizable secrets", () => {
  assert.equal(safeRssItemLink("https://example.test/item?lang=vi&n=2"), "https://example.test/item?lang=vi&n=2");
  const safe = safeRssItemLink("https://example.test/item?lang=vi&token=secret-value");
  assert.ok(!safe.includes("secret-value"));
  assert.equal(new URL(safe).searchParams.get("lang"), "vi");
  assert.equal(safeRssItemLink("javascript:alert(1)"), "");
  assert.equal(safeRssItemLink("https://user:pass@example.test/item"), "");
});

test("RSS embedded URLs are sanitized in output while source identifiers remain stable", () => {
  const xml = feed("<item><guid>stable</guid><title>Read https://example.test/item?token=secret-value</title><link>https://example.test/item?lang=vi&amp;token=secret-value</link></item>");
  const result = parseRssTriggerSnapshot(xml);
  assert.ok(!JSON.stringify(result).includes("secret-value"));
  assert.equal(new URL(result.observations[0]!.item.link).searchParams.get("lang"), "vi");
});
