import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeSentryListIssues, listSentryOrganizations, listSentryProjects } from "./sentry";

const credential = { token: "fixture-token", region: "de" };
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SENTRY); return credential;
} } as unknown as CredentialService;

test("Sentry discovery uses region, bearer header and organization-scoped projects", async () => {
  const urls: string[] = [];
  const transport = async (url: string, init: RequestInit) => {
    urls.push(url);
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer fixture-token");
    assert.ok(!url.includes(credential.token));
    return Response.json([{ slug: urls.length === 1 ? "example-org" : "web", name: "Example" }], { headers: { link: '<https://de.sentry.io/?cursor=next>; rel="next"; results="true"; cursor="next"' } });
  };
  assert.deepEqual(await listSentryOrganizations(credential, transport), { organizations: [{ id: "example-org", name: "Example" }], hasMore: true });
  assert.deepEqual(await listSentryProjects(credential, "example-org", transport), { projects: [{ id: "web", name: "Example" }], hasMore: true });
  assert.match(urls[1]!, /^https:\/\/de\.sentry\.io\/api\/0\/organizations\/example-org\/projects\//);
  await assert.rejects(listSentryProjects(credential, "../bad", transport), /Choose a Sentry organization/);
});

test("Sentry issue query limits results and avoids returning extra private provider fields", async () => {
  const result = await executeSentryListIssues({ credentialId: "connection", organization: "example-org", project: "web", status: "unresolved", limit: 1 }, "live", "workspace", credentials, async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("project"), "web");
    assert.equal(parsed.searchParams.get("query"), "is:unresolved");
    return Response.json([{ id: "1", title: "Example error", status: "unresolved", assignedTo: { email: "private@example.test" } }, { id: "2" }]);
  });
  assert.equal(result.output.issues.length, 1);
  assert.equal(result.output.hasMore, true);
  assert.ok(!JSON.stringify(result.output).includes("private@example.test"));
});

test("Sentry rejects invalid regions and classifies rate limits without exposing tokens", async () => {
  await assert.rejects(listSentryOrganizations({ token: "fixture-token", region: "__proto__" }, async () => { throw new Error("must not call"); }), /supported region/);
  await assert.rejects(executeSentryListIssues({ credentialId: "connection", organization: "example-org", project: "web" }, "live", "workspace", credentials, async () => new Response("provider secret detail", { status: 429 })), (error: unknown) => {
    const failure = error as { retryable: boolean; message: string }; assert.equal(failure.retryable, true); assert.ok(!failure.message.includes("secret")); return true;
  });
});
