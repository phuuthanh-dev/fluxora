import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import IORedis from "ioredis";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = join(repositoryRoot, "apps/api");
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
let ephemeralRedis;

if (!(await canReachRedis(redisUrl))) {
  const { RedisMemoryServer } = await import("redis-memory-server");
  ephemeralRedis = await RedisMemoryServer.create({ binary: { version: "7.2.5" } });
  process.env.REDIS_URL = `redis://${await ephemeralRedis.getHost()}:${await ephemeralRedis.getPort()}`;
  process.stdout.write("API tests started an isolated Redis 7.2.5 runtime.\n");
} else {
  process.env.REDIS_URL = redisUrl;
  process.stdout.write("API tests are using the configured Redis runtime.\n");
}

const testFiles = await findTests(join(apiRoot, "src"));
const tsxCli = join(repositoryRoot, "node_modules/tsx/dist/cli.mjs");

try {
  const exitCode = await run(process.execPath, [tsxCli, "--test", ...testFiles], apiRoot);
  process.exitCode = exitCode;
} finally {
  await ephemeralRedis?.stop();
}

async function canReachRedis(url) {
  const connection = new IORedis(url, {
    connectTimeout: 500,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  connection.on("error", () => undefined);
  try {
    await connection.connect();
    return await connection.ping() === "PONG";
  } catch {
    return false;
  } finally {
    connection.disconnect();
  }
}

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  }));
  return files.flat().sort();
}

function run(command, args, cwd) {
  return new Promise((resolveExitCode, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`API tests stopped by ${signal}.`));
      else resolveExitCode(code ?? 1);
    });
  });
}
