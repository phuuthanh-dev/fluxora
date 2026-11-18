import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { readProviderJson, requireProviderSuccess, uncertainDelivery } from "./provider-request-policy";

type Operation = "add-comment" | "add-label" | "remove-label";
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const idPattern = /^[a-f0-9]{24}$/i;

export async function executeTrelloCardAction(operation: Operation, config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport?: Transport) {
  const issue = nodeConfigIssues(`action.trello.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const cardId = config.cardId as string;
  const labelId = operation === "add-comment" ? "" : config.labelId as string;
  const text = operation === "add-comment" ? config.text as string : "";
  const output = operation === "add-comment" ? { cardId, commentId: "dddddddddddddddddddddddd" } : { cardId, labelId };
  if (mode === "mock") return { status: "succeeded" as const, output, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Trello connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TRELLO);
  const { apiKey, token } = credential;
  if (typeof apiKey !== "string" || typeof token !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(apiKey) || !/^[A-Za-z0-9_-]{1,512}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Trello connection requires an API key and token.", false);
  if ([cardId, labelId].some((value) => value.includes(apiKey) || value.includes(token))) throw new NodeFailure("INVALID_INPUT", "Choose a valid Trello resource.", false);
  const authorization = `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`;
  const headers = { authorization, accept: "application/json" };
  if (operation !== "add-comment") {
    const read = async (path: string) => {
      let response: Response;
      try { response = await (transport ?? fetchSafeOutbound)(`https://api.trello.com/1/${path}?fields=id,idBoard`, { headers, signal: AbortSignal.timeout(10_000) }); }
      catch (error) { throw nodeFailureFromOutboundPolicy(error); }
      await requireProviderSuccess(response, "Trello", false);
      const value = await readProviderJson(response, "Trello");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned an invalid resource.", false);
      return value as Record<string, unknown>;
    };
    const [card, label] = await Promise.all([read(`cards/${cardId}`), read(`labels/${labelId}`)]);
    if (card.id !== cardId || label.id !== labelId || typeof card.idBoard !== "string" || !idPattern.test(card.idBoard) || card.idBoard !== label.idBoard) throw new NodeFailure("INVALID_INPUT", "Choose a label from the card's board.", false);
  }
  const path = operation === "add-comment" ? `cards/${cardId}/actions/comments` : operation === "add-label" ? `cards/${cardId}/idLabels` : `cards/${cardId}/idLabels/${labelId}`;
  const params = operation === "add-comment" ? new URLSearchParams({ text }) : operation === "add-label" ? new URLSearchParams({ value: labelId }) : undefined;
  let response: Response;
  try { response = await (transport ?? fetchSafeOutboundWrite)(`https://api.trello.com/1/${path}${params ? `?${params}` : ""}`, { method: operation === "remove-label" ? "DELETE" : "POST", headers, signal: AbortSignal.timeout(10_000) }); }
  catch { throw uncertainDelivery("Trello"); }
  if (wasOutboundRedirected(response) || response.status === 429) { await response.body?.cancel().catch(() => undefined); throw uncertainDelivery("Trello", response.status); }
  await requireProviderSuccess(response, "Trello", true);
  const result = await readProviderJson(response, "Trello", true);
  if (operation === "add-comment") {
    const id = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>).id : undefined;
    if (typeof id !== "string" || !idPattern.test(id) || id.includes(apiKey) || id.includes(token)) throw uncertainDelivery("Trello");
    return { status: "succeeded" as const, output: { cardId, commentId: id }, route: "success" as const };
  }
  return { status: "succeeded" as const, output, route: "success" as const };
}
