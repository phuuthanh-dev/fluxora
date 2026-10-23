import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const prismaCli = new URL("../apps/api/node_modules/prisma/build/index.js", import.meta.url);
const argumentsFromCaller = process.argv.slice(2);

const child = spawn(process.execPath, [fileURLToPath(prismaCli), ...argumentsFromCaller, "--schema", "apps/api/prisma/schema.prisma"], {
  cwd: new URL("../", import.meta.url),
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exitCode = code ?? 1);
child.on("error", (error) => {
  console.error(`Unable to start Prisma from ${scriptPath}:`, error.message);
  process.exitCode = 1;
});
