import type { NestExpressApplication } from "@nestjs/platform-express";
import { json } from "express";
import type { ErrorRequestHandler } from "express";

export function configureBodyParsers(app: NestExpressApplication) {
  // Large Shopify privacy requests need their exact bytes for signature checks.
  const path = "/api/v1/integrations/shopify/privacy";
  app.use(path, json({ limit: 1_000_000, verify: (request, _response, buffer) => { (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
  const parserError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    const type = error && typeof error === "object" && "type" in error ? error.type : undefined;
    if (type === "entity.too.large" || type === "entity.parse.failed") {
      response.status(type === "entity.too.large" ? 413 : 400).json({ code: "SHOPIFY_PRIVACY_INVALID", message: "Invalid Shopify notification." });
      return;
    }
    next(error);
  };
  app.use(path, parserError);
  // Nest detects the scoped parser by name and would skip its global parser.
  app.useBodyParser("json");
}
