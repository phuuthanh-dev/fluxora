import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeOutboundUrl, fetchSafeOutbound, OutboundRequestPolicyError } from "./outbound-url-policy";

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
