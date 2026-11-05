import assert from "node:assert/strict";
import test from "node:test";
import type { CredentialService } from "../credentials/credential.service";
import { executeDriveCreateFolder, executeDriveGetFile } from "./google-drive-file-operations";
import { NodeFailure } from "./node-failure";
import { liveCredentialRequirements } from "./live-readiness";

const token = "synthetic-google-token";
const credentials = { readGoogleForExecution: async (id: string, workspace: string) => { assert.equal(id, "connection"); assert.equal(workspace, "workspace"); return { accessToken: token }; } } as unknown as CredentialService;
const never = { readGoogleForExecution: () => { throw new Error("unexpected credential read"); } } as unknown as CredentialService;
const mimeType = "application/vnd.google-apps.folder";

test("Drive metadata reads only selected fields using the workspace connection", async () => {
  const result = await executeDriveGetFile({ credentialId: "connection", fileId: "file_123" }, "live", "workspace", credentials, async (url, init) => {
    assert.equal(new URL(url).pathname, "/drive/v3/files/file_123");
    assert.equal(new URL(url).searchParams.get("fields"), "id,name,mimeType");
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    return Response.json({ id: "file_123", name: "Example", mimeType: "application/pdf", privateData: token });
  });
  assert.deepEqual(result.output, { file: { id: "file_123", name: "Example", mimeType: "application/pdf" } });
  assert.ok(!JSON.stringify(result).includes(token));
  const root = await executeDriveGetFile({ credentialId: "connection", fileId: "root" }, "live", "workspace", credentials, async () => Response.json({ id: "actual_root_id", name: "My Drive", mimeType }));
  assert.equal(root.output.file.id, "actual_root_id");
  await assert.rejects(executeDriveGetFile({ credentialId: "connection", fileId: "root" }, "live", "workspace", credentials, async () => Response.json({ id: "not_root", name: "File", mimeType: "text/plain" })), /invalid file metadata/);
  await assert.rejects(executeDriveGetFile({ fileId: "../bad" }, "mock", "workspace", never), /valid Google Drive/);
  await assert.rejects(executeDriveGetFile({ credentialId: "connection", fileId: "file_123" }, "live", "workspace", credentials, async () => Response.json({ id: "other", name: "Example", mimeType: "text/plain" })), /invalid file metadata/);
  await assert.rejects(executeDriveGetFile({ credentialId: "connection", fileId: "file_123" }, "live", "workspace", credentials, async () => Response.json({ id: "file_123", name: token, mimeType: "text/plain" })), (error: unknown) => error instanceof NodeFailure && !error.retryable && !error.message.includes(token));
});

test("Drive metadata honors bounded Retry-After without exposing response data", async () => {
  for (const [retryAfter, retryable] of [["5", true], ["120", false]] as const) {
    await assert.rejects(executeDriveGetFile({ credentialId: "connection", fileId: "file_123" }, "live", "workspace", credentials, async () => new Response(token, { status: 429, headers: { "retry-after": retryAfter } })), (error: unknown) => error instanceof NodeFailure && error.retryable === retryable && !error.message.includes(token));
  }
});

test("Drive folder creation uses an optional single parent and returns a bounded receipt", async () => {
  const result = await executeDriveCreateFolder({ credentialId: "connection", parentId: "parent_123", name: "Reports" }, "live", "workspace", credentials, async (url, init) => {
    assert.equal(new URL(url).pathname, "/drive/v3/files");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(String(init.body)), { name: "Reports", mimeType, parents: ["parent_123"] });
    return Response.json({ id: "folder_1", name: "Reports", mimeType, other: token });
  });
  assert.deepEqual(result.output, { folder: { id: "folder_1", name: "Reports", mimeType } });
  const mock = await executeDriveCreateFolder({ name: "Example" }, "mock", "workspace", never);
  assert.equal(mock.output.folder.name, "Example");
  await assert.rejects(executeDriveCreateFolder({ name: " " }, "mock", "workspace", never), /folder name/);
  await assert.rejects(executeDriveCreateFolder({ name: "Example", parentId: "../bad" }, "mock", "workspace", never), /valid Google Drive/);
});

test("Drive folder creation does not retry an uncertain provider outcome", async () => {
  for (const status of [302, 408, 429, 500, 503]) {
    await assert.rejects(executeDriveCreateFolder({ credentialId: "connection", name: "Reports" }, "live", "workspace", credentials, async () => new Response(token, { status })), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes(token));
  }
  for (const transport of [async () => { throw new Error(token); }, async () => Response.json({ id: "folder_1", name: token, mimeType }), async () => new Response("not-json", { status: 200 })]) {
    await assert.rejects(executeDriveCreateFolder({ credentialId: "connection", name: "Reports" }, "live", "workspace", credentials, transport), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes(token));
  }
  await assert.rejects(executeDriveCreateFolder({ credentialId: "connection", name: "Reports" }, "live", "workspace", credentials, async () => new Response(token, { status: 403 })), (error: unknown) => error instanceof NodeFailure && error.code === "GOOGLE_DRIVE_WRITE_REJECTED" && !error.retryable && !error.message.includes(token));
});

test("both Drive operations require a Google connection for live execution", () => {
  const graph = { nodes: ["action.google-drive.get-file", "action.google-drive.create-folder"].map((type, index) => ({ id: String(index), type, position: { x: 0, y: 0 }, config: { credentialId: "connection" } })), edges: [] };
  assert.deepEqual(liveCredentialRequirements(graph as never).map((entry) => entry.provider), ["GOOGLE", "GOOGLE"]);
});
