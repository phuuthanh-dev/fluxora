import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// GitHub's paginated run-attempt jobs response is an array of pages with --slurp.
// Never infer success from workflow_run.conclusion alone: a docs-only run has a
// successful workflow conclusion even though the verify job was skipped.
export function upstreamVerification(pages, headSha, attempt) {
  if (!/^[a-f0-9]{40}$/.test(headSha) || !Number.isSafeInteger(attempt) || attempt < 1 || !Array.isArray(pages)) throw new Error("Invalid upstream metadata");
  if (pages.some((page) => !page || typeof page !== "object" || !Array.isArray(page.jobs))) throw new Error("Invalid jobs response");
  const jobs = pages.flatMap((page) => page.jobs);
  function matchingJob(name) {
    const matches = jobs.filter((job) => job?.name === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one upstream ${name} job`);
    const job = matches[0];
    if (job.head_sha !== headSha || job.run_attempt !== attempt || job.status !== "completed") throw new Error(`Upstream ${name} job does not match the triggering attempt`);
    return job;
  }
  const verify = matchingJob("verify");
  if (verify.conclusion === "skipped") return "skipped";
  if (verify.conclusion !== "success") throw new Error("Upstream verify job was not successful");
  for (const name of ["CI core", "E2E shard 1/2", "E2E shard 2/2"]) {
    if (matchingJob(name).conclusion !== "success") throw new Error(`Upstream ${name} was not successful`);
  }
  return "verified";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const pages = JSON.parse(readFileSync(0, "utf8"));
    process.stdout.write(`${upstreamVerification(pages, process.argv[2] ?? "", Number(process.argv[3]))}\n`);
  } catch {
    process.stderr.write("Unable to verify the upstream quality job; deployment is blocked.\n");
    process.exitCode = 1;
  }
}
