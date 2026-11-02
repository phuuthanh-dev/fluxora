import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { observabilityTransport } from "./observability-read";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function text(value: unknown, limit = 300) { return typeof value === "string" ? value.slice(0, limit) : ""; }
function validTeam(value: string) { return value === "personal" || /^team_[A-Za-z0-9]{1,100}$/.test(value); }
function validProject(value: string) { return /^prj_[A-Za-z0-9]{1,100}$/.test(value); }
function cursorValue(value: unknown): string | null {
  const result = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  return typeof result === "string" && /^(0|[1-9][0-9]{0,15})$/.test(result) && Number.isSafeInteger(Number(result)) ? result : null;
}

async function get(path: string, token: string, transport: Transport) {
  if (!/^[A-Za-z0-9._-]{1,512}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Vercel connection requires a valid access token.", false);
  let response: Response;
  try { response = await transport(`https://api.vercel.com/${path}`, { method: "GET", redirect: "manual", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Vercel returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let data: unknown;
  try { data = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Vercel returned an invalid response.", false); }
  const result = object(data);
  if (!result) throw new NodeFailure("INVALID_RESPONSE", "Vercel returned an invalid response.", false);
  return result;
}
function nextPage(result: Record<string, unknown>) { return object(result.pagination)?.next != null; }
function optionList(value: unknown, valid: (value: string) => boolean) {
  if (!Array.isArray(value)) throw new NodeFailure("INVALID_RESPONSE", "Vercel returned an invalid resource list.", false);
  return value.flatMap((item: unknown) => {
    const entry = object(item); const id = text(entry?.id, 110);
    return valid(id) && typeof entry?.name === "string" ? [{ id, name: text(entry.name) || id }] : [];
  });
}
function tokenFrom(credential: Record<string, unknown>) { return typeof credential.token === "string" ? credential.token : ""; }
function parameters(team: string, limit: number) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (team !== "personal") params.set("teamId", team);
  return params;
}

export async function listVercelTeams(credential: Record<string, unknown>, transport: Transport = fetchSafeOutbound) {
  let result: Record<string, unknown>;
  try { result = await get("v2/teams?limit=100", tokenFrom(credential), transport); }
  catch (error) {
    if (error instanceof NodeFailure && error.statusCode === 403) return {
      teams: [{ id: "personal", name: "Personal account" }], hasMore: false,
      warning: "Vercel denied team discovery for this token. Personal projects may still be available; enter a team ID manually if needed.",
    };
    throw error;
  }
  const teams = optionList(result.teams, (id) => id !== "personal" && validTeam(id));
  return { teams: [{ id: "personal", name: "Personal account" }, ...teams.slice(0, 100)], hasMore: nextPage(result) || teams.length > 100 };
}

export async function listVercelProjects(credential: Record<string, unknown>, team: string, transport: Transport = fetchSafeOutbound) {
  if (!validTeam(team)) throw new NodeFailure("INVALID_INPUT", "Choose a Vercel account or team.", false);
  const result = await get(`v10/projects?${parameters(team, 100)}`, tokenFrom(credential), transport);
  const projects = optionList(result.projects, validProject);
  return { projects: projects.slice(0, 100), hasMore: nextPage(result) || projects.length > 100 };
}

type VercelDeploymentsOutput = { deployments: Array<{ id: string; name: string; state: string; target: string; createdAt: number | null; url: string }>; hasMore: boolean; nextCursor?: string | null; partial?: boolean; partialReasons?: string[] };
export async function executeVercelListDeployments(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport | undefined = undefined, paginationVersion: 1 | 2 = 2): Promise<{ status: "succeeded"; output: VercelDeploymentsOutput; route: "success" }> {
  const team = typeof config.team === "string" ? config.team : "personal";
  const project = typeof config.project === "string" ? config.project : "";
  const limit = config.limit === undefined ? 20 : config.limit;
  const cursor = paginationVersion === 1 || config.cursor === undefined || config.cursor === null || config.cursor === "" ? null : cursorValue(config.cursor);
  if (!validTeam(team) || !validProject(project) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100 || (paginationVersion === 2 && config.cursor !== undefined && config.cursor !== null && config.cursor !== "" && cursor === null)) throw new NodeFailure("INVALID_INPUT", "Choose an account and project, a limit between 1 and 100, and a valid cursor.", false);
  if (mode === "mock") {
    const output = { deployments: [{ id: "dpl_example", name: "Example deployment", state: "READY", target: "production", createdAt: 0, url: "example.vercel.app" }], hasMore: false };
    return { status: "succeeded", output: paginationVersion === 1 ? output : { ...output, nextCursor: null, partial: false, partialReasons: [] }, route: "success" };
  }
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Vercel connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.VERCEL);
  const params = parameters(team, limit); params.set("projectId", project);
  if (cursor !== null) params.set("until", cursor);
  const result = await get(`v6/deployments?${params}`, tokenFrom(credential), transport ?? (paginationVersion === 1 ? fetchSafeOutbound : observabilityTransport));
  if (!Array.isArray(result.deployments)) throw new NodeFailure("INVALID_RESPONSE", "Vercel returned an invalid deployment list.", false);
  const deployments = result.deployments.slice(0, limit).flatMap((value: unknown) => {
    const entry = object(value); const id = text(entry?.uid, 110);
    if (!/^dpl_[A-Za-z0-9]{1,100}$/.test(id)) return [];
    const url = text(entry?.url, 253);
    return [{ id, name: text(entry?.name), state: text(entry?.state ?? entry?.readyState, 50), target: text(entry?.target, 50), createdAt: typeof entry?.created === "number" ? entry.created : null, url: /^[a-z0-9.-]+\.vercel\.app$/i.test(url) ? url : "" }];
  });
  if (paginationVersion === 1) return { status: "succeeded", output: { deployments, hasMore: nextPage(result) || result.deployments.length > limit }, route: "success" };
  const pagination = object(result.pagination);
  const hasNext = pagination !== undefined && Object.hasOwn(pagination, "next");
  const rawNext = pagination?.next;
  const nextCursor = rawNext === null ? null : cursorValue(rawNext);
  const reasons: string[] = [];
  if (deployments.length < Math.min(result.deployments.length, limit)) reasons.push("invalid_items_omitted");
  if (result.deployments.length > limit) reasons.push("provider_page_exceeded_limit");
  if (!hasNext) reasons.push("continuation_unknown");
  else if (rawNext !== null && nextCursor === null) reasons.push("continuation_unavailable");
  return { status: "succeeded" as const, output: { deployments, hasMore: nextPage(result) || result.deployments.length > limit, nextCursor: result.deployments.length > limit ? null : nextCursor, partial: reasons.length > 0, partialReasons: reasons }, route: "success" as const };
}
