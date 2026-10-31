import { spawnSync } from "node:child_process";
import { qualityCommands } from "./workspace-quality-policy.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const query = spawnSync(npm, ["query", ".workspace", "--json"], { encoding: "utf8" });
if (query.status !== 0) {
  process.stderr.write(query.stderr || "Could not discover npm workspaces.\n");
  process.exit(query.status || 1);
}

const workspaces = JSON.parse(query.stdout);
for (const workspace of workspaces) {
  const scripts = workspace.scripts || {};
  const commands = qualityCommands(scripts);
  for (const command of commands) {
    const run = spawnSync(npm, ["run", command, "--workspace", workspace.name], { stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status || 1);
  }
  if (scripts.lint && !commands.includes("lint")) console.log(`Skipped duplicate lint for ${workspace.name} (same as typecheck).`);
}
