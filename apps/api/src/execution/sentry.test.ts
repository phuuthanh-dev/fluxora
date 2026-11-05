import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeSentryListIssues, listSentryInstallations, listSentryOrganizations, listSentryProjects } from "./sentry";

const credential = { token: "fixture-token", region: "de" };
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SENTRY); return credential;
} } as unknown as CredentialService;

test("Sentry installation discovery limits results to the selected organization and installed apps", async () => {
  const uuid = "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a";
  const result = await listSentryInstallations(credential, "example-org", async (url, init) => {
    assert.equal(new URL(url).pathname, "/api/0/organizations/example-org/sentry-app-installations/");
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer fixture-token");
    return Response.json([
      { uuid, status: "installed", organization: { slug: "example-org" }, app: { slug: "fluxora-test" } },
      { uuid, status: "pending", organization: { slug: "example-org" }, app: { slug: "pending-app" } },
      { uuid, status: "installed", organization: { slug: "other-org" }, app: { slug: "other-app" } },
    ]);
  });
  assert.deepEqual(result.installations, [{ id: uuid, name: "fluxora-test" }]);
  assert.ok(!JSON.stringify(result).includes(credential.token));
});

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

test("Sentry refuses credential echoes in displayed resources and issue fields before truncation", async () => {
  const safeFailure = (error: unknown) => {
    const failure = error as { code?: string; message?: string };
    assert.equal(failure.code, "INVALID_RESPONSE");
    assert.ok(!failure.message?.includes(credential.token));
    return true;
  };
  await assert.rejects(listSentryOrganizations(credential, async () => Response.json([{ slug: "example", name: `${"x".repeat(297)}fixture-token` }])), safeFailure);
  await assert.rejects(listSentryProjects(credential, "example", async () => Response.json([{ slug: "fixture-token", name: "Example" }])), safeFailure);
  {
    await assert.rejects(executeSentryListIssues({ credentialId: "connection", organization: "example", project: "web" }, "live", "workspace", credentials, async () => Response.json([{ id: "1", title: `${"x".repeat(497)}fixture-token` }])), safeFailure);
  }
  const numericToken = { readForExecution: async () => ({ token: "123", region: "de" }) } as unknown as CredentialService;
  await assert.rejects(executeSentryListIssues({ credentialId: "connection", organization: "example", project: "web" }, "live", "workspace", numericToken, async (url) => {
    const next = new URL(url); next.searchParams.set("cursor", "123:0:1");
    return Response.json([], { headers: { link: `<${next}>; rel="next"; results="true"; cursor="123:0:1"` } });
  }), (error: unknown) => (error as { code?: string }).code === "INVALID_RESPONSE");
});

test("Sentry rejects invalid regions and classifies rate limits without exposing tokens", async () => {
  await assert.rejects(listSentryOrganizations({ token: "fixture-token", region: "__proto__" }, async () => { throw new Error("must not call"); }), /supported region/);
  await assert.rejects(executeSentryListIssues({ credentialId: "connection", organization: "example-org", project: "web" }, "live", "workspace", credentials, async () => new Response("provider secret detail", { status: 429 })), (error: unknown) => {
    const failure = error as { retryable: boolean; message: string }; assert.equal(failure.retryable, true); assert.ok(!failure.message.includes("secret")); return true;
  });
});
