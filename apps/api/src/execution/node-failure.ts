import { OutboundRequestPolicyError } from "./outbound-url-policy";

export class NodeFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "NodeFailure";
  }
}

export function nodeFailureFromOutboundPolicy(reason: unknown): NodeFailure {
  if (reason instanceof NodeFailure) return reason;
  if (reason instanceof OutboundRequestPolicyError) return new NodeFailure(reason.code, reason.message, false);
  const timeout = reason instanceof Error && reason.name === "TimeoutError";
  return new NodeFailure(
    timeout ? "TIMEOUT" : "NETWORK_ERROR",
    timeout ? "Outbound request timed out." : "Outbound request failed.",
    true,
  );
}
