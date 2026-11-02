import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// GitHub's paginated run-attempt jobs response is an array of pages with --slurp.
// Never infer success from workflow_run.conclusion alone: a docs-only run has a
// successful workflow conclusion even though the verify job was skipped.
export function upstreamVerification(pages, headSha, attempt) {
  if (!/^[a-f0-9]{40}$/.test(headSha) || !Number.isSafeInteger(attempt) || attempt < 1 || !Array.isArray(pages)) throw new Error("Invalid upstream metadata");
  if (pages.some((page) => !page || typeof page !== "object" || !Array.isArray(page.jobs))) throw new Error("Invalid jobs response");
  const jobs = pages.flatMap((page) => page.jobs).filter((job) => job?.name === "verify");
  if (jobs.length !== 1) throw new Error("Expected exactly one upstream verify job");
  const job = jobs[0];
  if (job.head_sha !== headSha || job.run_attempt !== attempt || job.status !== "completed") throw new Error("Upstream verify job does not match the triggering attempt");
  if (job.conclusion === "success") return "verified";
  if (job.conclusion === "skipped") return "skipped";
  throw new Error("Upstream verify job was not successful");
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
