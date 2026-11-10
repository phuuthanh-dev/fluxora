import { Controller, Headers, HttpCode, Inject, Post, RawBody } from "@nestjs/common";
import { WebhookService } from "./webhook.service";

/** One Slack app has one Events URL, shared by its workspace installations. */
@Controller("integrations/slack")
export class SlackEventsController {
  constructor(@Inject(WebhookService) private readonly webhooks: WebhookService) {}

  @Post("events")
  @HttpCode(200)
  receive(@RawBody() raw: Buffer, @Headers("x-slack-signature") signature?: string, @Headers("x-slack-request-timestamp") timestamp?: string) {
    return this.webhooks.receiveSlackEvent(raw, { signature, timestamp });
  }
}
