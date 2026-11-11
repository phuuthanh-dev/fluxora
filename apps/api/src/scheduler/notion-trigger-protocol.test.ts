import assert from "node:assert/strict";
import test from "node:test";
import { notionChangedPages } from "./notion-trigger-protocol";

const source = "11111111-1111-4111-8111-111111111111";
const page = { object: "page", id: "22222222-2222-4222-8222-222222222222", created_time: "2026-11-10T00:00:00.000Z", last_edited_time: "2026-11-11T00:00:00.000Z" };

test("Notion polling consumes all pages and retains their timestamps", async () => {
  const calls: unknown[] = [];
  const query = async (input: { cursor?: string }) => {
    calls.push(input);
    return { results: [page], hasMore: !input.cursor, nextCursor: input.cursor ? null : "next", queryCompleteness: "complete", outputInfo: { redaction: "", completeness: "" } };
  };
  const result = await notionChangedPages("fake-token", source, "2026-11-10T00:00:00.000Z", query as never);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.editedTime, page.last_edited_time);
  assert.equal((calls[1] as { cursor: string }).cursor, "next");
});

test("Notion polling fails closed on incomplete or repeated continuation", async () => {
  const incomplete = async () => ({ results: [page], hasMore: false, nextCursor: null, queryCompleteness: "incomplete" });
  await assert.rejects(notionChangedPages("fake-token", source, page.created_time, incomplete as never), /incomplete change window/);
  const repeat = async () => ({ results: [page], hasMore: true, nextCursor: "same", queryCompleteness: "complete" });
  await assert.rejects(notionChangedPages("fake-token", source, page.created_time, repeat as never), /continuation cursor/);
});
