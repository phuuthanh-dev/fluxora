import assert from "node:assert/strict";
import test from "node:test";
import { graphCredentialIds } from "./credential-references";

test("collects distinct connection IDs from current and legacy node configurations", () => {
  const graph = { nodes: [
    { config: { credentialId: "steam", notificationCredentialId: "chat" } },
    { data: { config: { credentialId: "steam", notificationCredentialId: "other" } } },
    { config: { credentialId: "" } },
    null,
  ] };
  assert.deepEqual(graphCredentialIds(graph), ["chat", "other", "steam"]);
  assert.deepEqual(graphCredentialIds({ nodes: "invalid" }), []);
});
