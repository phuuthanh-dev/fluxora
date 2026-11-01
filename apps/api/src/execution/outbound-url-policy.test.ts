import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { Agent } from "undici";
import { assertSafeOutboundHostname, assertSafeOutboundUrl, createSafeSocketLookup, fetchSafeOutbound, isBlockedAddress, OutboundRequestPolicyError } from "./outbound-url-policy";
import { nodeFailureFromOutboundPolicy } from "./node-failure";

const publicResolver = async () => ["93.184.216.34"];

test("blocks localhost, private, link-local, and non-HTTP outbound targets", async () => {
  for (const target of ["http://localhost", "http://127.0.0.1", "http://10.0.0.8", "http://169.254.169.254", "ftp://example.com"]) {
    await assert.rejects(() => assertSafeOutboundUrl(target, { resolveHost: publicResolver }), (error: unknown) => error instanceof OutboundRequestPolicyError && error.code === "OUTBOUND_URL_BLOCKED");
  }
});

test("blocks hostnames that resolve to a non-public address", async () => {
  await assert.rejects(
    () => assertSafeOutboundUrl("https://metadata.invalid", { resolveHost: async () => ["169.254.169.254"] }),
    (error: unknown) => error instanceof OutboundRequestPolicyError && error.code === "OUTBOUND_URL_BLOCKED",
  );
});

test("allows public HTTPS destinations", async () => {
  const url = await assertSafeOutboundUrl("https://example.com/report", { resolveHost: publicResolver });
  assert.equal(url.toString(), "https://example.com/report");
});

test("applies the same public-network boundary to non-HTTP connector hostnames", async () => {
  await assertSafeOutboundHostname("smtp.example.com", { resolveHost: publicResolver });
  await assert.rejects(
    () => assertSafeOutboundHostname("localhost", { resolveHost: publicResolver }),
    (error: unknown) => error instanceof OutboundRequestPolicyError && error.code === "OUTBOUND_URL_BLOCKED",
  );
  await assert.rejects(
    () => assertSafeOutboundHostname("smtp.internal", { resolveHost: async () => ["10.0.0.7"] }),
    (error: unknown) => error instanceof OutboundRequestPolicyError && error.code === "OUTBOUND_URL_BLOCKED",
  );
});

test("rechecks redirect targets before following them", async () => {
  await assert.rejects(
    () => fetchSafeOutbound("https://example.com/start", {}, {
      resolveHost: publicResolver,
      fetchImplementation: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    }),
    (error: unknown) => error instanceof OutboundRequestPolicyError && error.code === "OUTBOUND_URL_BLOCKED",
  );
});

test("follows same-origin redirects with a fresh validated target", async () => {
  const requestedUrls: string[] = [];
  const response = await fetchSafeOutbound("https://example.com/start", { method: "POST", body: "payload" }, {
    resolveHost: publicResolver,
    fetchImplementation: async (input) => {
      requestedUrls.push(String(input));
      return requestedUrls.length === 1
        ? new Response(null, { status: 302, headers: { location: "/complete" } })
        : new Response("ok", { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(requestedUrls, ["https://example.com/start", "https://example.com/complete"]);
});

test("blocks equivalent IPv6 forms of local and mapped private addresses", () => {
  for (const address of ["0:0:0:0:0:0:0:1", "::7f00:1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "fc00::1", "100::1", "2001:10::1", "2001:db8::1"]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
});

test("socket lookup prevents DNS rebinding before a local server receives traffic", async () => {
  let hits = 0;
  const server = createServer((_request, response) => { hits += 1; response.end("private"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const dispatcher = new Agent({ connect: { lookup: createSafeSocketLookup(async () => [{ address: "127.0.0.1", family: 4 }]) } });
  try {
    // Initial DNS validation sees a public IP; the socket lookup sees a rebind.
    await assert.rejects(fetchSafeOutbound(`http://rebind.invalid:${address.port}/`, {}, {
      resolveHost: publicResolver,
      dispatcher,
    }), (error: unknown) => nodeFailureFromOutboundPolicy(error).code === "OUTBOUND_URL_BLOCKED");
    assert.equal(hits, 0);
  } finally {
    await dispatcher.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("socket lookup returns only validated DNS answers for the requested family", async () => {
  const resolve = createSafeSocketLookup(async () => [{ address: "93.184.216.34", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }]);
  const addresses = await new Promise<unknown>((done, reject) => resolve("public.example", { family: 6, all: true }, (error, result) => error ? reject(error) : done(result)));
  assert.deepEqual(addresses, [{ address: "2606:4700:4700::1111", family: 6 }]);
});

test("explicitly allowed local targets still work through the socket dispatcher", async () => {
  const server = createServer((_request, response) => response.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previous = process.env.OUTBOUND_ALLOWED_HOSTNAMES;
  process.env.OUTBOUND_ALLOWED_HOSTNAMES = "allowed.example";
  const dispatcher = new Agent({ connect: { lookup: createSafeSocketLookup(async () => [{ address: "127.0.0.1", family: 4 }]) } });
  try {
    const response = await fetchSafeOutbound(`http://allowed.example:${address.port}/`, {}, { dispatcher });
    assert.equal(await response.text(), "ok");
  } finally {
    if (previous === undefined) delete process.env.OUTBOUND_ALLOWED_HOSTNAMES;
    else process.env.OUTBOUND_ALLOWED_HOSTNAMES = previous;
    await dispatcher.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
