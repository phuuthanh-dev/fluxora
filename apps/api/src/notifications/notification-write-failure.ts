import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";

/** A failed transport does not establish that the provider rejected a send. */
export function notificationWriteFailure(reason: unknown): NodeFailure {
  const failure = nodeFailureFromOutboundPolicy(reason);
  return new NodeFailure(failure.code, failure.message, false, failure.statusCode);
}

/** Receipt failures happen after a write and must never trigger a resend. */
export function notificationReceiptFailure(provider: string): NodeFailure {
  return new NodeFailure(
    "DELIVERY_UNCERTAIN",
    `${provider} did not confirm the message receipt. Check the destination before retrying.`,
    false,
  );
}
