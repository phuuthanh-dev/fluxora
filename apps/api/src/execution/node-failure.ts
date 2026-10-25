import { OutboundRequestPolicyError } from "./outbound-url-policy";
import { BadRequestException } from "@nestjs/common";

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

export function nodeFailureFromExecutionError(reason: unknown): NodeFailure {
  if (reason instanceof NodeFailure) return reason;
  if (reason instanceof BadRequestException) {
    const response = reason.getResponse();
    if (response && typeof response === "object" && !Array.isArray(response)) {
      const record = response as Record<string, unknown>;
      const code = typeof record.code === "string" ? record.code : "NODE_ERROR";
      const message = typeof record.message === "string" ? record.message : "Node execution failed.";
      return new NodeFailure(code, message, false);
    }
  }
  return new NodeFailure("NODE_ERROR", "Node execution failed.", false);
}
