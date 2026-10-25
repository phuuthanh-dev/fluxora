import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";
import { applyHttpCredential, HttpCredentialError } from "../execution/http-credential";
import type { NotificationAdapter, NotificationPayload, NormalizedDeliveryResult } from "./notification-contracts";

export function sanitizeHttpDestination(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "http://[invalid-destination]";
  }
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "http://[invalid-destination]";
  }
}

export class HttpWebhookNotificationAdapter implements NotificationAdapter {
  readonly provider = "http_webhook" as const;

  async send(
    payload: NotificationPayload,
    credentialData?: Record<string, unknown>,
    mode: "mock" | "live" = "live",
  ): Promise<NormalizedDeliveryResult> {
    if (mode === "mock") {
      return {
        delivered: true,
        provider: this.provider,
        destination: sanitizeHttpDestination(payload.destination || "http://mock-webhook-destination"),
        sentAt: new Date().toISOString(),
        mode: "mock",
      };
    }

    const rawUrl = typeof credentialData?.webhookUrl === "string" && credentialData.webhookUrl
      ? credentialData.webhookUrl
      : (typeof payload.destination === "string" ? payload.destination : "");

    if (!/^https?:\/\//.test(rawUrl)) {
      throw new NodeFailure("INVALID_CONFIGURATION", "HTTP webhook requires an http(s) URL.", false);
    }

    let url = rawUrl;
    let headers: Record<string, string> = { "Content-Type": "application/json" };

    if (credentialData) {
      try {
        const authenticated = applyHttpCredential(url, headers, credentialData);
        url = authenticated.url;
        headers = authenticated.headers;
      } catch (reason) {
        throw new NodeFailure(
          "CREDENTIAL_INVALID",
          reason instanceof HttpCredentialError ? reason.message : "HTTP credential could not be used.",
          false,
        );
      }
    }

    const destination = sanitizeHttpDestination(url);

    const body = {
      type: "workflow.approval.requested",
      message: payload.message ?? payload.content ?? "Approval requested",
      approvalUrl: payload.approvalUrl,
    };

    let response: Response;
    try {
      response = await fetchSafeOutbound(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (reason) {
      throw nodeFailureFromOutboundPolicy(reason);
    }

    if (!response.ok) {
      throw new NodeFailure(
        "HTTP_ERROR",
        `HTTP webhook returned ${response.status}.`,
        response.status === 429 || response.status >= 500,
        response.status,
      );
    }

    return {
      delivered: true,
      provider: this.provider,
      destination,
      sentAt: new Date().toISOString(),
      mode: "live",
    };
  }
}
