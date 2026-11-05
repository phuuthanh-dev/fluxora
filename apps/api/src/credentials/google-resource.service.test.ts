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
    await service.listFiles("ws-1", "credential-1", "user-1", "folder", "page-2");
    const folderRequest = new URL(requestUrl);
    assert.equal(folderRequest.searchParams.get("q"), "trashed = false and mimeType = 'application/vnd.google-apps.folder'");
    assert.equal(folderRequest.searchParams.get("pageToken"), "page-2");
  } finally { globalThis.fetch = original; }
});

test("Drive metadata picker loads all file types and rejects credential echoes", async () => {
  const original = globalThis.fetch;
  const service = new GoogleResourceService({ requireOwner: async () => undefined, readGoogleForExecution: async () => ({ accessToken: "synthetic-google-token" }) } as never);
  try {
    globalThis.fetch = async (url) => {
      assert.equal(new URL(String(url)).searchParams.get("q"), "trashed = false");
      return Response.json({ files: [{ id: "pdf_1", name: "Report", mimeType: "application/pdf" }, { id: "folder_1", name: "Work", mimeType: "application/vnd.google-apps.folder" }] });
    };
    const result = await service.listFiles("workspace", "connection", "owner", "all");
    assert.equal(result.files.length, 2);
    globalThis.fetch = async () => Response.json({ files: [{ id: "file", name: "synthetic-google-token", mimeType: "text/plain" }] });
    await assert.rejects(service.listFiles("workspace", "connection", "owner", "all"), (error: unknown) => error instanceof Error && !error.message.includes("synthetic-google-token"));
    globalThis.fetch = async () => Response.json({ files: [], nextPageToken: "synthetic-google-token" });
    await assert.rejects(service.listFiles("workspace", "connection", "owner", "all"), (error: unknown) => error instanceof Error && !error.message.includes("synthetic-google-token"));
  } finally { globalThis.fetch = original; }
});
