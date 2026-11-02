import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeSentryListIssues } from "./sentry";
import { executeVercelListDeployments } from "./vercel";
import { executeSentryGetIssue } from "./sentry-observability";
import { executeVercelPublicDeploymentLookup } from "./vercel-observability";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace");
  return provider === CredentialProvider.SENTRY ? { token: "fixture-token", region: "de" } : { token: "fixture-token" };
} } as unknown as CredentialService;
const sentryConfig = { credentialId: "connection", organization: "acme", project: "web", limit: 1 };
const vercelConfig = { credentialId: "connection", team: "team_abc", project: "prj_abc", limit: 1 };
const issue = { id: "1", shortId: "WEB-1", title: "Example issue", status: "unresolved", level: "error", firstSeen: "2026-01-01T00:00:00Z", lastSeen: "2026-01-01T00:00:00Z", count: "1" };
const deployment = { uid: "dpl_abc", name: "Example", state: "READY", target: "production", created: 123, url: "site.vercel.app" };
function sentryLink(requestUrl: string, cursor = "0:10:0", more = true) {
  const url = new URL(requestUrl); url.searchParams.set("cursor", cursor);
  return `<${url}>; rel="next"; results="${more}"; cursor="${cursor}"`;
}

test("existing Sentry list preserves fields and scopes successive cursor pages", async () => {
  let calls = 0;
  const transport = async (url: string, init: RequestInit) => {
    const parsed = new URL(url); calls++;
    assert.equal(parsed.hostname, "de.sentry.io"); assert.equal(parsed.searchParams.get("project"), "web");
    assert.equal(parsed.searchParams.get("cursor"), calls === 1 ? null : "0:10:0");
    assert.equal(init.method, "GET"); assert.equal(init.redirect, "manual"); assert.ok(!url.includes("fixture-token"));
    return Response.json([{ ...issue, assignedTo: { email: "private@example.test" } }], { headers: { link: sentryLink(url, calls === 1 ? "0:10:0" : "0:20:0", calls === 1) } });
  };
  const first = await executeSentryListIssues(sentryConfig, "live", "workspace", credentials, transport);
  assert.deepEqual(first.output.issues[0], issue); assert.equal(first.output.hasMore, true);
  assert.equal(first.output.nextCursor, "0:10:0"); assert.equal(first.output.partial, false);
  const second = await executeSentryListIssues({ ...sentryConfig, cursor: first.output.nextCursor }, "live", "workspace", credentials, transport);
  assert.equal(second.output.hasMore, false); assert.equal(second.output.nextCursor, null);
  assert.ok(!JSON.stringify(first.output).includes("private@example.test"));
});

test("Sentry rejects untrusted, inconsistent, malformed and duplicate next links", async () => {
  const variants = [
    (url: URL) => { url.hostname = "evil.example"; return `<${url}>; rel="next"; results="true"`; },
    (url: URL) => { url.pathname = "/api/0/organizations/other/issues/"; return `<${url}>; rel="next"; results="true"`; },
    (url: URL) => { url.searchParams.set("project", "other"); return `<${url}>; rel="next"; results="true"`; },
    (url: URL) => { url.searchParams.append("project", "web"); return `<${url}>; rel="next"; results="true"`; },
    (url: URL) => { url.searchParams.append("cursor", "0:20:0"); return `<${url}>; rel="next"; results="true"`; },
    (url: URL) => `<${url}>; rel="next"; results="true"; cursor="0:20:0"`,
    (url: URL) => `<${url}>; rel="next"; results="true"; results="false"`,
    (url: URL) => `<${url}>; rel="next"; results="false"; cursor="0:20:0"`,
    (url: URL) => `<${url}>; rel="next"; results="true", <${url}>; rel="next"; results="true"`,
    (url: URL) => `<${url}>; rel="next"; results="true"; broken`,
  ];
  for (const variant of variants) {
    await assert.rejects(executeSentryListIssues(sentryConfig, "live", "workspace", credentials, async (url) => {
      const target = new URL(url); target.searchParams.set("cursor", "0:10:0");
      return Response.json([issue], { headers: { link: variant(target) } });
    }), /invalid pagination metadata/);
  }
  await assert.rejects(executeSentryListIssues({ ...sentryConfig, cursor: "https://evil.example" }, "live", "workspace", credentials, async () => { throw new Error("unexpected request"); }), /valid cursor/);
});

test("Sentry preserves boolean hasMore but makes missing and truncated pagination explicit", async () => {
  const missing = await executeSentryListIssues(sentryConfig, "live", "workspace", credentials, async () => Response.json([issue]));
  assert.equal(missing.output.hasMore, false); assert.equal(missing.output.nextCursor, null); assert.ok(missing.output.partialReasons?.includes("continuation_unknown"));
  const overflow = await executeSentryListIssues(sentryConfig, "live", "workspace", credentials, async (url) => Response.json([{ id: "" }, issue], { headers: { link: sentryLink(url) } }));
  assert.equal(overflow.output.nextCursor, null); assert.equal(overflow.output.hasMore, true); assert.ok(overflow.output.partialReasons?.includes("invalid_items_omitted"));
  assert.ok(overflow.output.partialReasons?.includes("provider_page_exceeded_limit"));
});

test("existing Vercel list preserves fields and scopes successive cursor pages", async () => {
  let calls = 0;
  const transport = async (url: string, init: RequestInit) => {
    calls++; const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.vercel.com"); assert.equal(parsed.pathname, "/v6/deployments");
    assert.equal(parsed.searchParams.get("teamId"), "team_abc"); assert.equal(parsed.searchParams.get("projectId"), "prj_abc");
    assert.equal(parsed.searchParams.get("until"), calls === 1 ? null : "123"); assert.equal(init.redirect, "manual");
    return Response.json({ deployments: [{ ...deployment, meta: { secret: "private" } }], pagination: { next: calls === 1 ? 123 : null } });
  };
  const first = await executeVercelListDeployments(vercelConfig, "live", "workspace", credentials, transport);
  assert.deepEqual(first.output.deployments[0], { id: "dpl_abc", name: "Example", state: "READY", target: "production", createdAt: 123, url: "site.vercel.app" });
  assert.equal(first.output.nextCursor, "123"); assert.equal(first.output.hasMore, true); assert.equal(first.output.partial, false);
  const second = await executeVercelListDeployments({ ...vercelConfig, cursor: first.output.nextCursor }, "live", "workspace", credentials, transport);
  assert.equal(second.output.hasMore, false); assert.ok(!JSON.stringify(first.output).includes("private"));
});

test("Vercel retains hasMore semantics while reporting unavailable continuation and overflow", async () => {
  const missing = await executeVercelListDeployments(vercelConfig, "live", "workspace", credentials, async () => Response.json({ deployments: [] }));
  assert.equal(missing.output.hasMore, false); assert.ok(missing.output.partialReasons?.includes("continuation_unknown"));
  const bad = await executeVercelListDeployments(vercelConfig, "live", "workspace", credentials, async () => Response.json({ deployments: [deployment], pagination: { next: "https://evil.example" } }));
  assert.equal(bad.output.hasMore, true); assert.equal(bad.output.nextCursor, null); assert.ok(bad.output.partialReasons?.includes("continuation_unavailable"));
  const overflow = await executeVercelListDeployments(vercelConfig, "live", "workspace", credentials, async () => Response.json({ deployments: [deployment, deployment], pagination: { next: 123 } }));
  assert.equal(overflow.output.hasMore, true); assert.equal(overflow.output.nextCursor, null); assert.ok(overflow.output.partialReasons?.includes("provider_page_exceeded_limit"));
  await assert.rejects(executeVercelListDeployments({ ...vercelConfig, cursor: "https://evil.example" }, "live", "workspace", credentials, async () => { throw new Error("unexpected request"); }), /valid cursor/);
});

test("list mock results retain their original examples without credential or transport calls", async () => {
  const unused = {} as CredentialService;
  const sentry = await executeSentryListIssues(sentryConfig, "mock", "workspace", unused, async () => { throw new Error("unexpected request"); });
  assert.equal(sentry.output.issues[0]?.title, "Example issue"); assert.equal(sentry.output.hasMore, false); assert.equal(sentry.output.nextCursor, null);
  const vercel = await executeVercelListDeployments(vercelConfig, "mock", "workspace", unused, async () => { throw new Error("unexpected request"); });
  assert.equal(vercel.output.deployments[0]?.url, "example.vercel.app"); assert.equal(vercel.output.hasMore, false); assert.equal(vercel.output.nextCursor, null);
});

test("Sentry detail requires and verifies project and redacts invalid field values", async () => {
  const config = { credentialId: "connection", organization: "acme", project: "web", issueId: "1" };
  const good = await executeSentryGetIssue(config, "live", "workspace", credentials, async (url) => {
    assert.equal(new URL(url).pathname, "/api/0/organizations/acme/issues/1/");
    return Response.json({ ...issue, project: { slug: "web" }, title: "Example issue", shortId: "private@example.test", status: "private@example.test", level: "private@example.test", firstSeen: "private@example.test", count: "private@example.test" });
  });
  assert.ok(!JSON.stringify(good.output).includes("private")); assert.equal(good.output.issue.title, "Example issue"); assert.equal(good.output.issue.partial, true); assert.equal(good.output.issue.status, null);
  const redacted = await executeSentryGetIssue(config, "live", "workspace", credentials, async () => Response.json({ ...issue, project: { slug: "web" }, title: `${"x".repeat(495)}fixture-token` }));
  assert.ok(!JSON.stringify(redacted.output).includes("fixture-token"));
  assert.equal(redacted.output.issue.titleTruncated, true);
  for (const project of [{ slug: "other" }, {}, null]) await assert.rejects(executeSentryGetIssue(config, "live", "workspace", credentials, async () => Response.json({ ...issue, project })), /selected project/);
  await assert.rejects(executeSentryGetIssue({ ...config, project: "" }, "live", "workspace", credentials, async () => { throw new Error("unexpected request"); }), /organization, project/);
});

test("Vercel public detail never claims ownership and rejects IDs and redirects", async () => {
  const config = { credentialId: "connection", team: "personal", deploymentId: "dpl_abc" };
  const result = await executeVercelPublicDeploymentLookup(config, "live", "workspace", credentials, async (url) => {
    const parsed = new URL(url); assert.equal(parsed.pathname, "/v13/deployments/dpl_abc"); assert.equal(parsed.searchParams.has("teamId"), false);
    return Response.json({ id: "dpl_abc", readyState: "private@example.test", target: "private@example.test", errorMessage: "private" });
  });
  assert.equal(result.output.lookup, "public"); assert.equal(result.output.ownershipVerified, false); assert.equal(result.output.deployment.partial, true);
  assert.ok(!JSON.stringify(result.output).includes("private"));
  await assert.rejects(executeVercelPublicDeploymentLookup({ ...config, deploymentId: "https://evil.example" }, "live", "workspace", credentials, async () => { throw new Error("unexpected request"); }));
  await assert.rejects(executeVercelPublicDeploymentLookup(config, "live", "workspace", credentials, async () => new Response(null, { status: 302, headers: { location: "https://evil.example" } })));
});
