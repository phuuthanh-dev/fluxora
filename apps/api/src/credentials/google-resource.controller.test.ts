import assert from "node:assert/strict";
import test from "node:test";
import { GoogleResourceController } from "./google-resource.controller";

test("Google folder discovery uses the selected workspace and rejects unsupported kinds", async () => {
  const calls: unknown[][] = [];
  const controller = new GoogleResourceController({ listFiles: async (...args: unknown[]) => { calls.push(args); return { files: [], nextPageToken: null }; } } as never);
  const request = { currentUser: { id: "user-1" } } as never;
  await controller.files("workspace-1", "credential-1", request, "folder", "next-page");
  assert.deepEqual(calls, [["workspace-1", "credential-1", "user-1", "folder", "next-page"]]);
  await assert.rejects(controller.files("workspace-1", "credential-1", request, "unsupported"));
  assert.equal(calls.length, 1);
});


test("Drive discovery accepts real-world long cursors but rejects oversized values", async () => {
  const calls: unknown[][] = [];
  const controller = new GoogleResourceController({ listFiles: async (...args: unknown[]) => { calls.push(args); return { files: [] }; } } as never);
  const request = { currentUser: { id: "owner" } } as never;
  await controller.files("ws", "cred", request, "all", "x".repeat(616));
  assert.equal((calls[0]?.[4] as string).length, 616);
  await assert.rejects(controller.files("ws", "cred", request, "all", "x".repeat(2049)));
});
