import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { getJson, observabilityTransport, record, token, type ObservabilityTransport } from "./observability-read";
import { assertNoCredentialInProviderFields } from "./provider-credential-safety";

const validTeam = (value: unknown): value is string => typeof value === "string" && (value === "personal" || /^team_[A-Za-z0-9]{1,100}$/.test(value));
const validDeployment = (value: unknown): value is string => typeof value === "string" && /^dpl_[A-Za-z0-9]{1,100}$/.test(value);
const states = new Set(["BUILDING", "ERROR", "INITIALIZING", "QUEUED", "READY", "CANCELED", "BLOCKED"]);
const targets = new Set(["production", "staging"]);
function normalizeDeployment(value: unknown) {
  const item = record(value);
  const id = item?.uid ?? item?.id;
  if (!item || !validDeployment(id)) return null;
  const rawState = item.readyState ?? item.state;
  const state = typeof rawState === "string" && states.has(rawState) ? rawState : null;
  const target = typeof item.target === "string" && targets.has(item.target) ? item.target : null;
  const createdAt = typeof item.created === "number" && Number.isSafeInteger(item.created) && item.created >= 0 ? item.created : null;
  // A null target denotes preview; other absent or unknown values are partial.
  const partial = state === null || (item.target !== null && target === null) || createdAt === null;
  return { id, state, target, createdAt, partial };
}
async function accessToken(config: Record<string, unknown>, workspaceId: string, credentials: CredentialService) {
  const id = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!id) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Vercel connection.", false);
  return token(await credentials.readForExecution(id, workspaceId, CredentialProvider.VERCEL), "Vercel");
}
function teamParams(team: string) {
  const params = new URLSearchParams();
  if (team !== "personal") params.set("teamId", team);
  return params;
}

// The provider can return a reduced public view. A successful lookup does not prove ownership.
export async function executeVercelPublicDeploymentLookup(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: ObservabilityTransport = observabilityTransport) {
  const team = config.team === undefined ? "personal" : config.team;
  if (!validTeam(team) || !validDeployment(config.deploymentId)) throw new NodeFailure("INVALID_INPUT", "Choose an account and deployment ID.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { lookup: "public" as const, ownershipVerified: false as const, deployment: { id: config.deploymentId, state: "READY", target: "production", createdAt: null, partial: true } }, route: "success" as const };
  const params = teamParams(team);
  const activeToken = await accessToken(config, workspaceId, credentials);
  const result = await getJson(`https://api.vercel.com/v13/deployments/${config.deploymentId}?${params}`, activeToken, "Vercel", transport);
  const deployment = normalizeDeployment(result.data);
  if (!deployment || deployment.id !== config.deploymentId) throw new NodeFailure("INVALID_RESPONSE", "Vercel returned an invalid deployment.", false);
  assertNoCredentialInProviderFields([deployment.id, deployment.state, deployment.target], activeToken);
  return { status: "succeeded" as const, output: { lookup: "public" as const, ownershipVerified: false as const, deployment }, route: "success" as const };
}
