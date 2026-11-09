import { fetchSafeOutboundWrite, wasOutboundRedirected } from "../execution/outbound-url-policy";
import { NodeFailure } from "../execution/node-failure";
import { readBoundedProviderText } from "../execution/provider-json";
import { notificationReceiptFailure, notificationWriteFailure } from "./notification-write-failure";
import type { NotificationAdapter, NotificationPayload, NormalizedDeliveryResult } from "./notification-contracts";

export function validateSlackWebhookUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a valid Slack incoming webhook URL.", false);
  let url: URL;
  try { url = new URL(value); } catch { throw new NodeFailure("CREDENTIAL_INVALID", "Enter a valid Slack incoming webhook URL.", false); }
  if (url.protocol !== "https:" || !["hooks.slack.com", "hooks.slack-gov.com"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(url.pathname)) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a valid Slack incoming webhook URL.", false);
  return url.href;
}

export class SlackNotificationAdapter implements NotificationAdapter {
  readonly provider = "slack" as const;
  async send(payload: NotificationPayload, credentialData?: Record<string, unknown>, mode: "mock" | "live" = "live"): Promise<NormalizedDeliveryResult> {
    const message = typeof payload.message === "string" ? payload.message : "";
    if (!message.trim() || message.length > 4000) throw new NodeFailure("INVALID_CONFIGURATION", "Enter a Slack message of at most 4,000 characters.", false);
    const destination = "Slack incoming webhook";
    if (mode === "mock") return { delivered: true, provider: this.provider, destination, sentAt: new Date().toISOString(), mode };
    const url = validateSlackWebhookUrl(credentialData?.webhookUrl);
    let response: Response;
    try { response = await fetchSafeOutboundWrite(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(15_000) }); }
    catch (reason) { throw notificationWriteFailure(reason); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status >= 500 || response.status === 408 || response.status >= 300 && response.status < 400 || wasOutboundRedirected(response)) throw notificationReceiptFailure("Slack");
      throw new NodeFailure("HTTP_ERROR", `Slack returned ${response.status}.`, response.status === 429, response.status);
    }
    let body: string;
    try { body = await readBoundedProviderText(response, 1024); } catch { throw notificationReceiptFailure("Slack"); }
    if (body.trim() !== "ok") throw notificationReceiptFailure("Slack");
    return { delivered: true, provider: this.provider, destination, sentAt: new Date().toISOString(), mode };
  }
}
