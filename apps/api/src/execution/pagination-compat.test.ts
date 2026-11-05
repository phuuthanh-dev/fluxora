import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeGoogleDrive, executeNode, mockDrive } from "./execution.service";
import type { WorkflowNode, WorkflowNodeType } from "@workflow/contracts";
import { executeGmailRead, listGmailMessages } from "./gmail-read";
import { executeNotionSearch, searchNotionPages } from "./notion-search";
import { executeSentryListIssues } from "./sentry";
import { executeVercelListDeployments } from "./vercel";
import { redactValue } from "./redaction";
import { liveCredentialRequirements } from "./live-readiness";
import { NodeFailure } from "./node-failure";

const synthetic = { readForExecution: async (_id: string, _workspace: string, provider: CredentialProvider) => {
  if (provider === CredentialProvider.NOTION) return { token: "synthetic" };
  if (provider === CredentialProvider.SENTRY) return { token: "synthetic", region: "global" };
  if (provider === CredentialProvider.VERCEL) return { token: "synthetic" };
  throw new Error("unexpected credential provider");
}, readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as unknown as CredentialService;

test("Gmail and Drive reject unresolved filters before accessing credentials", async () => {
  const noCredential = { readForExecution: () => { throw new Error("credential must not be read"); }, readGoogleForExecution: () => { throw new Error("credential must not be read"); } } as never;
  for (const config of [{ query: undefined }, { query: null }, { limit: undefined }, { mailbox: undefined }]) {
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(executeGmailRead(config, mode, "workspace", noCredential), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
    }
  }
  for (const config of [{ operation: undefined }, { operation: "unknown" }, { operation: "search", query: undefined }, { operation: "search", query: null }]) {
    const node: WorkflowNode = { id: "drive", type: "action.google-drive", config, position: { x: 0, y: 0 } };
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(executeNode(node, config, {}, mode, "workspace", noCredential, "execution"), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
    }
  }
});

test("new Drive and other pagination types require the correct owner credentials", () => {
  const types = ["action.google-drive", "action.gmail.read", "action.notion.search-pages", "action.sentry.list-issues", "action.vercel.list-deployments"] as const;
  const graph = { nodes: types.map((type, index) => ({ id: String(index), type, position: { x: index, y: 0 }, config: { credentialId: "synthetic" } })), edges: [] };
  assert.deepEqual(liveCredentialRequirements(graph).map((row) => row.provider), [CredentialProvider.GOOGLE, CredentialProvider.GMAIL, CredentialProvider.NOTION, CredentialProvider.SENTRY, CredentialProvider.VERCEL]);
});

test("Drive upload failures are not automatically repeated", async () => {
  const previous = globalThis.fetch;
  try {
    {
      let calls = 0;
      globalThis.fetch = (async () => { calls++; throw new Error("synthetic network loss"); }) as typeof fetch;
      await assert.rejects(executeGoogleDrive({ accessToken: "synthetic" }, { operation: "uploadText", name: "report", text: "x" }), (error: unknown) => {
        const failure = error as { retryable?: boolean };
        assert.equal(failure.retryable, false); return true;
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = previous; }
});
