import "reflect-metadata";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Controller, Get, Inject, Injectable, Module, Sse, UseGuards, type CanActivate, type OnApplicationShutdown, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { ExecutionEventsService } from "../execution/execution-events.service";
import { BackgroundWork } from "./background-work";
import { RequestDrainInterceptor } from "./request-drain.interceptor";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("Nest shutdown gates new requests and keeps dependencies until accepted work completes", async () => {
  const scanStarted = deferred(), scanRelease = deferred(), stopStarted = deferred(), requestStarted = deferred(), requestRelease = deferred();
  let resourceClosed = false;

  @Injectable()
  class SyntheticBackground implements OnModuleInit, OnModuleDestroy {
    private readonly background = new BackgroundWork();
    onModuleInit() { this.background.start(async () => { scanStarted.resolve(); await scanRelease.promise; }, () => {}); }
    async onModuleDestroy() { stopStarted.resolve(); await this.background.drain(); }
  }

  @Injectable()
  class SyntheticResource implements OnApplicationShutdown {
    onApplicationShutdown() { resourceClosed = true; }
  }

  @Controller()
  class SyntheticController {
    @Get("slow") async slow() { requestStarted.resolve(); await requestRelease.promise; return { ok: true }; }
    @Get("ready") ready() { return { ok: true }; }
  }

  @Module({ providers: [SyntheticBackground, SyntheticResource], controllers: [SyntheticController] })
  class SyntheticModule {}

  const app = await NestFactory.create(SyntheticModule, { logger: false, return503OnClosing: true });
  let close: Promise<void> | undefined;
  try {
    await app.listen(0, "127.0.0.1");
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;
    await scanStarted.promise;
    const accepted = fetch(`${url}/slow`);
    await requestStarted.promise;
    close = app.close();
    await stopStarted.promise;
    assert.equal((await fetch(`${url}/ready`)).status, 503);
    assert.equal(resourceClosed, false);
    scanRelease.resolve();
    await Promise.resolve();
    assert.equal(resourceClosed, false);
    requestRelease.resolve();
    assert.deepEqual(await (await accepted).json(), { ok: true });
    await close;
    assert.equal(resourceClosed, true);
  } finally {
    scanRelease.resolve();
    requestRelease.resolve();
    await (close ?? app.close());
  }
});

test("Nest shutdown completes active execution event streams", async () => {
  const previousQueueMode = process.env.EXECUTION_QUEUE_MODE;
  process.env.EXECUTION_QUEUE_MODE = "inline";
  const subscribed = deferred();

  @Controller()
  class EventsController {
    constructor(@Inject(ExecutionEventsService) private readonly events: ExecutionEventsService) {}
    @Sse("events") stream() { subscribed.resolve(); return this.events.stream("execution-test"); }
  }
  @Module({ providers: [ExecutionEventsService, RequestDrainInterceptor, { provide: APP_INTERCEPTOR, useExisting: RequestDrainInterceptor }], controllers: [EventsController] })
  class EventsModule {}

  const app = await NestFactory.create(EventsModule, { logger: false, return503OnClosing: true });
  const abort = new AbortController();
  let close: Promise<void> | undefined;
  try {
    await app.listen(0, "127.0.0.1");
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const responsePromise = fetch(`http://127.0.0.1:${port}/events`, { signal: abort.signal, headers: { connection: "close" } });
    await subscribed.promise;
    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    close = app.close();
    await Promise.race([close, new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => reject(new Error("Shutdown did not close the SSE stream")), 3000);
      timeout.unref();
    })]);
    const body = await response.text();
    assert.equal(body.trim(), "");
  } finally {
    abort.abort();
    await (close ?? app.close());
    if (previousQueueMode === undefined) delete process.env.EXECUTION_QUEUE_MODE;
    else process.env.EXECUTION_QUEUE_MODE = previousQueueMode;
  }
});

test("a request still in a guard cannot start its handler after shutdown begins", async () => {
  const guardStarted = deferred(), releaseGuard = deferred(), stopped = deferred();
  let handlerCalled = false;
  @Injectable()
  class SlowGuard implements CanActivate {
    async canActivate() { guardStarted.resolve(); await releaseGuard.promise; return true; }
  }
  @Controller()
  class GuardedController {
    @Get("guarded") @UseGuards(SlowGuard) guarded() { handlerCalled = true; return { ok: true }; }
  }
  @Module({ providers: [SlowGuard, RequestDrainInterceptor, { provide: APP_INTERCEPTOR, useExisting: RequestDrainInterceptor }], controllers: [GuardedController] })
  class GuardedModule {}
  const app = await NestFactory.create(GuardedModule, { logger: false, return503OnClosing: true });
  let close: Promise<void> | undefined;
  try {
    await app.listen(0, "127.0.0.1");
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const request = fetch(`http://127.0.0.1:${port}/guarded`, { headers: { connection: "close" } });
    await guardStarted.promise;
    const tracker = app.get(RequestDrainInterceptor);
    const destroy = tracker.onModuleDestroy.bind(tracker);
    tracker.onModuleDestroy = async () => { const result = destroy(); stopped.resolve(); await result; };
    close = app.close();
    await stopped.promise;
    releaseGuard.resolve();
    assert.equal((await request).status, 503);
    assert.equal(handlerCalled, false);
    await close;
  } finally {
    releaseGuard.resolve();
    await (close ?? app.close());
  }
});

test("shutdown waits for an in-flight authentication lookup after client disconnect", async () => {
  const started = deferred(), release = deferred(), stopping = deferred();
  let resourceClosed = false;
  @Injectable()
  class SyntheticResource implements OnApplicationShutdown {
    onApplicationShutdown() { resourceClosed = true; }
  }
  @Controller()
  class GuardedController {
    @Get("guarded-auth") @UseGuards(AuthenticationGuard) guarded() { return { ok: true }; }
  }
  @Module({
    providers: [
      SyntheticResource,
      AuthenticationGuard,
      RequestDrainInterceptor,
      { provide: APP_INTERCEPTOR, useExisting: RequestDrainInterceptor },
      { provide: AuthService, useValue: { async getCurrentUser() { started.resolve(); await release.promise; assert.equal(resourceClosed, false); return { id: "test" }; } } },
    ],
    controllers: [GuardedController],
  })
  class GuardedModule {}
  const app = await NestFactory.create(GuardedModule, { logger: false, return503OnClosing: true });
  const abort = new AbortController();
  let close: Promise<void> | undefined;
  try {
    await app.listen(0, "127.0.0.1");
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const request = fetch(`http://127.0.0.1:${port}/guarded-auth`, { signal: abort.signal, headers: { cookie: "workflow_session=test" } }).catch(() => undefined);
    await started.promise;
    abort.abort();
    await request;
    const guard = app.get(AuthenticationGuard);
    const destroy = guard.onModuleDestroy.bind(guard);
    guard.onModuleDestroy = async () => { const result = destroy(); stopping.resolve(); await result; };
    close = app.close();
    await stopping.promise;
    assert.equal(resourceClosed, false);
    release.resolve();
    await close;
    assert.equal(resourceClosed, true);
  } finally {
    abort.abort();
    release.resolve();
    await (close ?? app.close());
  }
});

test("shutdown waits for a handler after its client disconnects", async () => {
  const started = deferred(), release = deferred();
  let resourceClosed = false;
  @Injectable()
  class SyntheticResource implements OnApplicationShutdown {
    onApplicationShutdown() { resourceClosed = true; }
  }
  @Controller()
  class SyntheticController {
    @Get("slow") async slow() { started.resolve(); await release.promise; assert.equal(resourceClosed, false); return { ok: true }; }
  }
  @Module({ providers: [SyntheticResource, RequestDrainInterceptor, { provide: APP_INTERCEPTOR, useExisting: RequestDrainInterceptor }], controllers: [SyntheticController] })
  class SyntheticModule {}
  const app = await NestFactory.create(SyntheticModule, { logger: false, return503OnClosing: true });
  const abort = new AbortController();
  let close: Promise<void> | undefined;
  try {
    await app.listen(0, "127.0.0.1");
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const request = fetch(`http://127.0.0.1:${port}/slow`, { signal: abort.signal }).catch(() => undefined);
    await started.promise;
    abort.abort();
    await request;
    close = app.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(resourceClosed, false, "resources closed while the disconnected handler was still running");
    release.resolve();
    await close;
    assert.equal(resourceClosed, true);
  } finally {
    abort.abort();
    release.resolve();
    await (close ?? app.close());
  }
});
