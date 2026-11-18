import { Controller, Headers, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { ShopifyPrivacyService } from "../credentials/shopify-privacy.service";

@Controller("integrations/shopify/privacy")
export class ShopifyPrivacyController {
  constructor(@Inject(ShopifyPrivacyService) private readonly privacy: ShopifyPrivacyService) {}
  @Post(":kind")
  @HttpCode(200)
  receive(@Param("kind") kind: string, @Req() request: RawBodyRequest<Request>, @Headers("x-shopify-hmac-sha256") signature?: string, @Headers("x-shopify-webhook-id") deliveryId?: string) {
    return this.privacy.receive(kind, request.rawBody, signature, deliveryId);
  }
}
