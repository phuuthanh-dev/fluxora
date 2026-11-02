import { strict as assert } from "node:assert";
import { ReadableStream } from "node:stream/web";
import { test } from "node:test";
import { NodeFailure } from "./node-failure";
import { readBoundedProviderJson, readBoundedProviderText } from "./provider-json";

const limit = 1_000_000;
const encoder = new TextEncoder();

function streamedResponse(chunks: readonly Uint8Array[], contentLength?: string, cancelFailure?: Error) {
  let pulls = 0;
  let cancellations = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulls++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(chunk);
    },
    cancel() {
      cancellations += 1;
      if (cancelFailure) throw cancelFailure;
    },
  }, { highWaterMark: 0 });
  return {
    response: new Response(stream, { headers: contentLength === undefined ? undefined : { "content-length": contentLength } }),
    stream,
    get pulls() { return pulls; },
    get cancellations() { return cancellations; },
  };
}

function isSizeFailure(error: unknown): boolean {
  assert.ok(error instanceof NodeFailure);
  assert.equal(error.code, "RESPONSE_TOO_LARGE");
  assert.equal(error.retryable, false);
  assert.equal(error.message, "Provider response exceeds the size limit.");
  assert.equal(error.cause, undefined);
  return true;
}

test("text and JSON accept exactly 1,000,000 bytes and release their streams", async () => {
  const text = "😀".repeat(limit / 4);
  const textBytes = encoder.encode(text);
  assert.equal(textBytes.byteLength, limit);
  const textSource = streamedResponse([textBytes.subarray(0, limit - 1), textBytes.subarray(limit - 1)]);
  assert.equal(await readBoundedProviderText(textSource.response), text);
  assert.equal(textSource.stream.locked, false);
  assert.equal(textSource.cancellations, 0);

  const value = "x".repeat(limit - 2);
  const jsonSource = streamedResponse([encoder.encode(JSON.stringify(value))], String(limit));
  assert.equal(await readBoundedProviderJson(jsonSource.response), value);
  assert.equal(jsonSource.stream.locked, false);
  assert.equal(jsonSource.cancellations, 0);
});

test("both readers cancel on split-chunk byte overflow despite missing or dishonest lengths", async () => {
  const cases = [
    { read: readBoundedProviderText, body: "é".repeat(limit / 2) + "!", contentLength: undefined },
    { read: readBoundedProviderJson, body: JSON.stringify("é".repeat(limit / 2 - 1) + "x"), contentLength: "1" },
  ];
  for (const { read, body, contentLength } of cases) {
    const bytes = encoder.encode(body);
    assert.equal(bytes.byteLength, limit + 1);
    const source = streamedResponse([
      bytes.subarray(0, 600_000), bytes.subarray(600_000, limit), bytes.subarray(limit), encoder.encode("unread"),
    ], contentLength);
    await assert.rejects(read(source.response), isSizeFailure);
    assert.equal(source.pulls, 3, "must stop at the first overflowing chunk");
    assert.equal(source.cancellations, 1);
    assert.equal(source.stream.locked, false);
  }
});

test("oversized declared length cancels an unread stream even if cancellation rejects", async () => {
  for (const cancelFailure of [undefined, new Error("synthetic provider cancellation detail")]) {
    const source = streamedResponse([encoder.encode("small body")], String(limit + 1), cancelFailure);
    await assert.rejects(readBoundedProviderText(source.response), isSizeFailure);
    assert.equal(source.pulls, 0);
    assert.equal(source.cancellations, 1);
    assert.equal(source.stream.locked, false);
  }
});

test("stream overflow still releases its lock when cancellation rejects", async () => {
  const source = streamedResponse([new Uint8Array(limit + 1)], undefined, new Error("synthetic provider cancellation detail"));
  await assert.rejects(readBoundedProviderJson(source.response), isSizeFailure);
  assert.equal(source.cancellations, 1);
  assert.equal(source.stream.locked, false);
});

test("text and JSON decode UTF-8 code points split across single-byte chunks", async () => {
  const value = { text: "Aé€😀Z" };
  const json = JSON.stringify(value);
  const chunks = Array.from(encoder.encode(json), (byte) => Uint8Array.of(byte));
  assert.equal(await readBoundedProviderText(streamedResponse(chunks).response), json);
  assert.deepEqual(await readBoundedProviderJson(streamedResponse(chunks).response), value);
});

test("empty text is allowed for 204 responses and closed empty streams", async () => {
  assert.equal(await readBoundedProviderText(new Response(null, { status: 204 })), "");
  const source = streamedResponse([]);
  assert.equal(await readBoundedProviderText(source.response), "");
  assert.equal(source.stream.locked, false);
});

test("empty and malformed JSON fail with content-free parse errors after releasing the stream", async () => {
  const responses = [
    new Response(null, { status: 204 }),
    streamedResponse([]).response,
    new Response(" \n\t "),
    new Response("synthetic-provider-content is not JSON"),
    new Response('{"synthetic-provider-content":'),
  ];
  for (const response of responses) {
    await assert.rejects(readBoundedProviderJson(response), (error: unknown) => {
      assert.ok(error instanceof SyntaxError);
      assert.equal(error.message, "Provider response is not valid JSON.");
      assert.equal(error.cause, undefined);
      assert.ok(!error.stack?.includes("synthetic-provider-content"));
      return true;
    });
    if (response.body) assert.equal(response.body.locked, false);
  }
});

test("JSON preserves null and array results without imposing an object shape", async () => {
  for (const value of [null, [true, 42, { text: "example" }]]) {
    const result: unknown = await readBoundedProviderJson(Response.json(value));
    assert.deepEqual(result, value);
  }
});

test("stream failures discard partial bodies and release locks without leaking error details", async () => {
  for (const name of ["Error", "AbortError", "TimeoutError"]) {
    for (const read of [readBoundedProviderText, readBoundedProviderJson]) {
      const detail = "synthetic-provider-content";
      const failure = new Error(detail, { cause: new Error(detail) });
      failure.name = name;
      let pulls = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulls++ === 0) controller.enqueue(encoder.encode(`{"text":"${detail}`));
          else controller.error(failure);
        },
      }, { highWaterMark: 0 });
      await assert.rejects(read(new Response(stream)), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, name);
        assert.equal(error.message, "Provider response could not be read.");
        assert.equal(error.cause, undefined);
        assert.ok(!error.stack?.includes(detail));
        return true;
      });
      assert.equal(stream.locked, false);
    }
  }
});
