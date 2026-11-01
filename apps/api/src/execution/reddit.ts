import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function text(value: unknown, max = 500) { return typeof value === "string" ? value.slice(0, max) : ""; }

async function request(url: string, init: RequestInit, transport: Transport) {
  let response: Response;
  try { response = await transport(url, { ...init, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Reddit returned ${response.status}. Check your app's API approval and permissions.`, response.status === 429 || response.status >= 500, response.status);
  try { return await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Reddit returned an invalid response.", false); }
}

export async function executeRedditListPosts(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const subreddit = typeof config.subreddit === "string" ? config.subreddit.trim().replace(/^r\//i, "") : "";
  const sort = config.sort === undefined ? "new" : config.sort;
  const limit = config.limit === undefined ? 20 : config.limit;
  if (!/^[A-Za-z0-9_]{3,21}$/.test(subreddit) || !["new", "hot"].includes(String(sort)) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Enter a subreddit name, choose a sort order and a limit between 1 and 100.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { posts: [{ id: "example", title: "Example post", subreddit, permalink: "/r/example/comments/example", createdUtc: 0 }], hasMore: false }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Reddit connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.REDDIT);
  const clientId = typeof credential.clientId === "string" ? credential.clientId : ""; const clientSecret = typeof credential.clientSecret === "string" ? credential.clientSecret : ""; const username = typeof credential.username === "string" ? credential.username : "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(clientId) || !/^[A-Za-z0-9_-]{1,512}$/.test(clientSecret) || !/^[A-Za-z0-9_-]{3,20}$/.test(username)) throw new NodeFailure("CREDENTIAL_INVALID", "Reddit connection requires an approved client ID, secret and username.", false);
  const userAgent = `Fluxora:v1.0 (by /u/${username})`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenResult = object(await request("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { authorization: `Basic ${basic}`, "user-agent": userAgent, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }, transport));
  const token = typeof tokenResult?.access_token === "string" ? tokenResult.access_token : "";
  if (!/^[A-Za-z0-9._-]{1,4096}$/.test(token) || String(tokenResult?.token_type).toLowerCase() !== "bearer") throw new NodeFailure("CREDENTIAL_INVALID", "Reddit did not issue an access token. Check API approval and the connection.", false);
  const params = new URLSearchParams({ limit: String(limit), raw_json: "1" });
  const listing = object(await request(`https://oauth.reddit.com/r/${subreddit}/${sort}?${params}`, { method: "GET", headers: { authorization: `Bearer ${token}`, "user-agent": userAgent, accept: "application/json" } }, transport));
  const data = object(listing?.data);
  if (!Array.isArray(data?.children)) throw new NodeFailure("INVALID_RESPONSE", "Reddit returned an invalid post listing.", false);
  const posts = data.children.slice(0, limit).flatMap((value: unknown) => {
    const post = object(object(value)?.data); const id = text(post?.id, 20); const permalink = text(post?.permalink, 2048);
    if (!/^[A-Za-z0-9]{1,20}$/.test(id)) return [];
    return [{ id, title: text(post?.title), subreddit: text(post?.subreddit, 21), permalink: /^\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+(?:\/[^?#\s]*)?$/.test(permalink) ? permalink : "", createdUtc: typeof post?.created_utc === "number" && Number.isFinite(post.created_utc) ? post.created_utc : null }];
  });
  return { status: "succeeded" as const, output: { posts, hasMore: typeof data.after === "string" && data.after.length > 0 }, route: "success" as const };
}
