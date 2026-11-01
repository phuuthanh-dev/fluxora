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
