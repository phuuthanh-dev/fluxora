import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const directory = process.env.FLUXORA_BACKUP_DIR || join(homedir(), ".local/share/fluxora/backups/production-daily");
const maxAgeHours = 36;
try {
  const names = (await readdir(directory)).filter((name) => /^fluxora-postgres-\d{8}T\d{6}Z\.dump$/.test(name));
  const files = await Promise.all(names.map(async (name) => ({ name, info: await stat(join(directory, name)) })));
  const newest = files.filter(({ info }) => info.isFile() && info.size > 0).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)[0];
  if (!newest || newest.info.mtimeMs > Date.now() + 300_000 || Date.now() - newest.info.mtimeMs > maxAgeHours * 3_600_000) throw new Error("No recent non-empty backup archive was found.");
  console.log(`Most recent backup: ${newest.name} (${newest.info.mtime.toISOString()}). This checks freshness only.`);
} catch (error) {
  console.error(`Backup freshness check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
