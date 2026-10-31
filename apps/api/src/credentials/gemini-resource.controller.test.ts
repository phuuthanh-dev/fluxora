import assert from "node:assert/strict";
import test from "node:test";
import { GeminiResourceController } from "./gemini-resource.controller";

test("Gemini model discovery checks workspace ownership before accessing secrets", async () => {
  let read = false;
  const controller = new GeminiResourceController({
    requireOwner: async (workspace: string, user: string) => {
      assert.deepEqual([workspace, user], ["workspace-1", "user-1"]);
      throw new Error("not authorized");
    },
    readForExecution: async () => { read = true; return {}; },
  } as never);
  await assert.rejects(controller.models("workspace-1", "credential-1", { currentUser: { id: "user-1" } } as never), /not authorized/);
  assert.equal(read, false);
});
