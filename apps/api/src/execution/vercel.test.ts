import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeVercelListDeployments, listVercelProjects, listVercelTeams } from "./vercel";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.VERCEL); return { token: "fixture-token" };
} } as unknown as CredentialService;

test("Vercel teams and projects use the selected scope and a bearer header", async () => {
  const urls: string[] = [];
  const transport = async (url: string, init: RequestInit) => {
    urls.push(url); assert.equal((init.headers as Record<string, string>).authorization, "Bearer fixture-token"); assert.ok(!url.includes("fixture-token"));
    return Response.json(url.includes("teams?") ? { teams: [{ id: "team_abc", name: "Team" }], pagination: { next: null } } : { projects: [{ id: "prj_abc", name: "Web" }], pagination: { next: 3 } });
  };
  assert.deepEqual(await listVercelTeams({ token: "fixture-token" }, transport), { teams: [{ id: "personal", name: "Personal account" }, { id: "team_abc", name: "Team" }], hasMore: false });
  assert.deepEqual(await listVercelProjects({ token: "fixture-token" }, "team_abc", transport), { projects: [{ id: "prj_abc", name: "Web" }], hasMore: true });
  assert.equal(new URL(urls[1]!).searchParams.get("teamId"), "team_abc");
  await assert.rejects(listVercelProjects({ token: "fixture-token" }, "../bad", transport), /Choose a Vercel/);
});

test("deployment list is project-scoped and excludes provider metadata", async () => {
  const result = await executeVercelListDeployments({ credentialId: "connection", team: "personal", project: "prj_abc", limit: 1 }, "live", "workspace", credentials, async (url) => {
    const parsed = new URL(url); assert.equal(parsed.searchParams.get("projectId"), "prj_abc"); assert.equal(parsed.searchParams.has("teamId"), false);
    return Response.json({ deployments: [{ uid: "dpl_abc", name: "Site", state: "READY", url: "site.vercel.app", meta: { secret: "private" }, created: 123 }], pagination: { next: null } });
  });
  assert.equal(result.output.deployments[0]?.id, "dpl_abc");
  assert.ok(!JSON.stringify(result.output).includes("private"));
});

test("Vercel handles permission and rate limit failures without provider details", async () => {
  await assert.rejects(executeVercelListDeployments({ credentialId: "connection", team: "team_abc", project: "prj_abc" }, "live", "workspace", credentials, async () => new Response("private provider error", { status: 429 })), (error: unknown) => {
    const failure = error as { retryable: boolean; message: string }; assert.equal(failure.retryable, true); assert.ok(!failure.message.includes("private")); return true;
  });
});

test("Vercel retains a personal account fallback only when team listing is forbidden", async () => {
  const result = await listVercelTeams({ token: "fixture-token" }, async () => new Response("provider detail", { status: 403 }));
  assert.deepEqual(result.teams, [{ id: "personal", name: "Personal account" }]);
  assert.match(result.warning ?? "", /denied team discovery/);
  assert.ok(!JSON.stringify(result).includes("provider detail"));
  await assert.rejects(listVercelTeams({ token: "fixture-token" }, async () => new Response("", { status: 401 })));
});
