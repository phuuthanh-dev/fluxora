import assert from "node:assert/strict";
import test from "node:test";
import { GoogleResourceService } from "./google-resource.service";

test("Google resource discovery authorizes the workspace and returns safe file metadata", async () => {
  const original = globalThis.fetch;
  let authorized = false;
  let requestUrl = "";
  globalThis.fetch = async (url) => {
    assert.equal(authorized, true);
    requestUrl = String(url);
    return Response.json({ files: [{ id: "file-1", name: "Report", mimeType: "application/vnd.google-apps.spreadsheet", accessToken: "must-not-return" }], nextPageToken: "next-page" });
  };
  try {
    const service = new GoogleResourceService({ requireOwner: async () => { authorized = true; }, readGoogleForExecution: async () => ({ accessToken: "test-access-token", refreshToken: "test-refresh-token" }) } as never);
    const result = await service.listFiles("ws-1", "credential-1", "user-1", "spreadsheet", "page-1");
    const request = new URL(requestUrl);
    assert.equal(request.origin, "https://www.googleapis.com");
    assert.equal(request.searchParams.get("pageToken"), "page-1");
    assert.match(request.searchParams.get("q") ?? "", /application\/vnd.google-apps.spreadsheet/);
    assert.deepEqual(result, { files: [{ id: "file-1", name: "Report", mimeType: "application/vnd.google-apps.spreadsheet" }], nextPageToken: "next-page" });
    assert.doesNotMatch(JSON.stringify(result), /test-access-token|test-refresh-token|must-not-return/);
    await service.listFiles("ws-1", "credential-1", "user-1", "file");
    assert.match(new URL(requestUrl).searchParams.get("q") ?? "", /mimeType contains 'text\//);
  } finally { globalThis.fetch = original; }
});
