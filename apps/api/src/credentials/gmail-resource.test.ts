import assert from "node:assert/strict";
import test from "node:test";
import { GmailResourceController } from "./gmail-resource.controller";

test("Gmail label discovery is owner scoped and does not return tokens", async () => {
  let checked = 0;
  const controller = new GmailResourceController({ requireOwner: async () => { checked++; }, readGoogleForExecution: async () => ({ accessToken: "secret" }) } as never);
  Object.defineProperty(controller, "getLabels", { value: async () => ({ labels: [{ id: "Label_1", name: "Support" }, { id: "bad/id", name: "Invalid" }] }) });
  const result = await controller.labels("workspace", "credential", { currentUser: { id: "owner" } } as never);
  assert.equal(checked, 1); assert.deepEqual(result.labels, [{ id: "Label_1", name: "Support" }]);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("Gmail label discovery does not use a credential if workspace access is denied", async () => {
  let reads = 0;
  const controller = new GmailResourceController({ requireOwner: async () => { throw new Error("denied"); }, readGoogleForExecution: async () => { reads++; } } as never);
  await assert.rejects(controller.labels("workspace", "credential", { currentUser: { id: "other" } } as never));
  assert.equal(reads, 0);
});

test("Gmail label discovery redacts tokens before truncation and never returns them in IDs", async () => {
  const controller = new GmailResourceController({ requireOwner: async () => {}, readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) } as never);
  Object.defineProperty(controller, "getLabels", { value: async () => ({ labels: [
    { id: "Label_1", name: `${"x".repeat(195)}synthetic-token` },
    { id: "Label_synthetic-token", name: "Ignore unsafe ID" },
  ] }) });
  const result = await controller.labels("workspace", "credential", { currentUser: { id: "owner" } } as never);
  assert.equal(result.labels.length, 1);
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
  assert.ok(!result.labels[0]!.name.includes("synth"));
});

test("Gmail draft discovery uses bounded metadata, pagination and workspace ownership", async () => {
  let checked = 0;
  const urls: string[] = [];
  const controller = new GmailResourceController({ requireOwner: async () => { checked++; }, readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) } as never);
  Object.defineProperty(controller, "getDraftJson", { value: async (url: string) => {
    urls.push(url);
    if (url.includes("maxResults")) return { drafts: [{ id: "d1" }, { id: "d2" }, { id: "../bad" }], nextPageToken: "next-page" };
    if (url.includes("/d2?")) throw new Error("detail unavailable");
    return { id: "d1", message: { payload: { headers: [{ name: "Subject", value: `${"x".repeat(115)}synthetic-token` }] } } };
  } });
  const result = await controller.drafts("workspace", "credential", { currentUser: { id: "owner" } } as never);
  assert.equal(checked, 1);
  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts[1]?.name, "Draft · d2");
  assert.equal(result.nextPageToken, "next-page");
  assert.ok(result.warning);
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
  assert.ok(urls.every((url) => !url.includes("../bad")));
});
