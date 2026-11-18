import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import type { AddressInfo } from "node:net";
import { configureBodyParsers } from "./shopify-body-parser";

@Module({})
class TestModule {}

test("Shopify privacy accepts larger raw bodies without breaking other JSON routes", async () => {
  const app = await NestFactory.create<NestExpressApplication>(TestModule, { rawBody: true, logger: false });
  configureBodyParsers(app);
  const reply = (req: Request & { rawBody?: Buffer }, res: Response) => res.json({ body: req.body, raw: req.rawBody?.toString("utf8") });
  app.use("/api/v1/integrations/shopify/privacy", reply);
  app.use("/api/v1/auth", reply);
  await app.listen(0, "127.0.0.1");
  try {
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const send = (path: string, body: string) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    const ordinary = JSON.stringify({ email: "fixture@example.test" });
    const auth = await send("/api/v1/auth", ordinary);
    assert.equal(auth.status, 200);
    assert.deepEqual(await auth.json(), { body: JSON.parse(ordinary), raw: ordinary });
    const large = JSON.stringify({ padding: "x".repeat(120_000) });
    const shopify = await send("/api/v1/integrations/shopify/privacy", large);
    assert.equal(shopify.status, 200);
    assert.deepEqual(await shopify.json(), { body: JSON.parse(large), raw: large });
    assert.ok((await send("/api/v1/auth", large)).status >= 400);
    assert.equal((await send("/api/v1/integrations/shopify/privacy", JSON.stringify({ padding: "x".repeat(1_000_000) }))).status, 413);
  } finally { await app.close(); }
});
