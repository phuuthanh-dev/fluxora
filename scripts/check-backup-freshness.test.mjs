import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("freshness check rejects missing, empty and stale archives", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fluxora-backup-test-"));
  const archive = join(dir, "fluxora-postgres-20261111T200812Z.dump");
  const run = () => spawnSync(process.execPath, ["scripts/check-backup-freshness.mjs"], { env: { ...process.env, FLUXORA_BACKUP_DIR: dir }, encoding: "utf8" });
  try {
    assert.equal(run().status, 1);
    await writeFile(archive, "");
    assert.equal(run().status, 1);
    await writeFile(archive, "synthetic archive");
    assert.equal(run().status, 0);
    const old = new Date(Date.now() - 37 * 3_600_000);
    await utimes(archive, old, old);
    assert.equal(run().status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
