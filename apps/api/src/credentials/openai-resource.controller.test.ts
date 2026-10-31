import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResourceController } from "./openai-resource.controller";

test("OpenAI model discovery checks ownership before reading a credential", async () => {
  let read = false;
  const controller = new OpenAIResourceController({ requireOwner: async () => { throw new Error("not authorized"); }, readForExecution: async () => { read = true; return {}; } } as never);
  await assert.rejects(controller.models("ws-1", "credential-1", { currentUser: { id: "user-1" } } as never), /not authorized/);
  assert.equal(read, false);
});
