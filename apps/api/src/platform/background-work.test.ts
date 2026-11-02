import assert from "node:assert/strict";
import test from "node:test";
import { BackgroundWork } from "./background-work";

test("drain waits for accepted timer tasks and refuses new work", async () => {
  const group = new BackgroundWork();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  group.start(async () => { calls += 1; await wait; }, () => assert.fail("unexpected failure"));
  await Promise.resolve();
  assert.equal(calls, 1);
  let finished = false;
  const draining = group.drain().then(() => { finished = true; });
  group.start(async () => { calls += 1; }, () => assert.fail("unexpected failure"));
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal(calls, 1);
  release();
  await draining;
  assert.equal(finished, true);
  await group.drain();
});

test("failed timer work is contained and drain completes", async () => {
  const group = new BackgroundWork();
  let failures = 0;
  group.start(async () => { throw new Error("synthetic-private-detail"); }, () => { failures += 1; });
  group.start(async () => { throw new Error("synthetic-private-detail"); }, () => { failures += 1; throw new Error("synthetic logger failure"); });
  await group.drain();
  assert.equal(failures, 2);
});
