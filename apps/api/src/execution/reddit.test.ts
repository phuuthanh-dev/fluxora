import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeRedditListPosts } from "./reddit";

const credential = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.REDDIT);
  return { clientId: "id_fixture", clientSecret: "secret_fixture", username: "fixture_user" };
} } as unknown as CredentialService;
const config = { credentialId: "connection", subreddit: "r/technology", sort: "new", limit: 1 };

test("Reddit uses an in-memory app token and limits output to public post metadata", async () => {
  let calls = 0;
  const result = await executeRedditListPosts(config, "live", "workspace", credential, async (url, init) => {
    calls++;
    assert.ok(!url.includes("secret_fixture"));
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["user-agent"], "Fluxora:v1.0 (by /u/fixture_user)");
    if (calls === 1) {
      assert.equal(url, "https://www.reddit.com/api/v1/access_token");
      assert.equal(init.body, "grant_type=client_credentials");
      assert.equal(headers.authorization, `Basic ${Buffer.from("id_fixture:secret_fixture").toString("base64")}`);
      return Response.json({ access_token: "token_fixture", token_type: "bearer" });
    }
    assert.equal(new URL(url).pathname, "/r/technology/new");
    assert.equal(headers.authorization, "Bearer token_fixture");
    return Response.json({ data: { after: "next", children: [{ data: { id: "abc", title: "Post", subreddit: "technology", permalink: "/r/technology/comments/abc/post/", created_utc: 42, selftext: "private fixture" } }, { data: { id: "def", title: "Extra" } }] } });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.output, { posts: [{ id: "abc", title: "Post", subreddit: "technology", permalink: "/r/technology/comments/abc/post/", createdUtc: 42 }], hasMore: true });
  assert.ok(!JSON.stringify(result).includes("fixture"));
});

test("invalid inputs never call Reddit and mock execution is offline", async () => {
  const never = async () => { throw new Error("unexpected request"); };
  await assert.rejects(executeRedditListPosts({ ...config, subreddit: "../other" }, "live", "workspace", credential, never), /subreddit/);
  await assert.rejects(executeRedditListPosts({ ...config, limit: 101 }, "live", "workspace", credential, never), /limit/);
  const result = await executeRedditListPosts(config, "mock", "workspace", credential, never);
  assert.equal(result.output.posts.length, 1);
});

test("provider errors and malformed tokens do not expose provider response", async () => {
  await assert.rejects(executeRedditListPosts(config, "live", "workspace", credential, async () => new Response("secret_fixture", { status: 403 })), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /403/); assert.ok(!error.message.includes("secret_fixture")); return true;
  });
  await assert.rejects(executeRedditListPosts(config, "live", "workspace", credential, async () => Response.json({ access_token: "unsafe\ntoken", token_type: "bearer" })), /did not issue/);
});
