import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOOP_LEDGER_PATH = resolve(ROOT, "docs/06-loop-engineering.md");
const STATE_PATH = resolve(ROOT, "docs/19-agent-state.md");
const COMPLETE_STATUS = /\bcomplete\b|\bverified\b/i;
const STATE_STATUS = new Set(["complete", "pending", "operator-gated", "owner-input-required", "planned", "deferred", "blocked"]);

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`Missing required state file: ${path}`);
  return readFileSync(path, "utf8");
}

export function parseLoopLedger(text) {
  const rows = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(/^\|\s*(L\d+(?:\.\d+)?)\s*\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (!match) continue;
    const id = match[1];
    if (rows.has(id)) throw new Error(`Duplicate loop ID in docs/06-loop-engineering.md: ${id}`);
    rows.set(id, { id, outcome: match[2].trim(), status: match[3].trim() });
  }
  if (rows.size === 0) throw new Error("No delivery loop rows found in docs/06-loop-engineering.md");
  return rows;
}

export function parseApprovedSlices(text) {
  const sectionStart = text.indexOf("## Next approved slices");
  if (sectionStart < 0) throw new Error("Missing '## Next approved slices' in docs/19-agent-state.md");
  const section = text.slice(sectionStart);
  const rows = new Map();
  for (const line of section.split("\n")) {
    const match = line.match(/^\|\s*`?([A-Z][A-Z0-9-]*)`?\s*\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (!match) continue;
    const id = match[1];
    if (id === "ID") continue;
    if (rows.has(id)) throw new Error(`Duplicate approved slice ID in docs/19-agent-state.md: ${id}`);
    const status = match[3].trim().toLowerCase();
    if (!STATE_STATUS.has(status)) throw new Error(`Unknown status for ${id}: ${status}`);
    if (status === "complete") throw new Error(`Approved slice ${id} cannot be marked complete; move it to the closed ledger.`);
    rows.set(id, { id, outcome: match[2].trim(), status });
  }
  if (rows.size === 0) throw new Error("No approved slice rows found in docs/19-agent-state.md");
  return rows;
}

function sectionBody(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const after = text.slice(start + heading.length);
  const nextHeading = after.search(/^##\s+/m);
  return (nextHeading < 0 ? after : after.slice(0, nextHeading)).trim();
}

export function parseTaskTargets(taskText) {
  const body = sectionBody(taskText, "## Target slice IDs");
  if (!body) throw new Error("Task contract must contain '## Target slice IDs'.");
  const ids = [...body.matchAll(/`([A-Z][A-Z0-9-]*(?:\.\d+)?)`/g)].map((match) => match[1]);
  if (ids.length === 0) throw new Error("Target slice IDs must use backtick IDs such as `UX-1` or `L8.4`.");
  return [...new Set(ids)];
}

export function validateTaskTargets(taskText, loopRows, approvedRows) {
  const targets = parseTaskTargets(taskText);
  const reopen = sectionBody(taskText, "## Reopen justification");
  const hasConcreteReopen = reopen.length >= 20 && !/<reason>|TBD|TODO|N\/A/i.test(reopen);
  const errors = [];

  for (const id of targets) {
    if (/^L\d/.test(id)) {
      const loop = loopRows.get(id);
      if (!loop) {
        errors.push(`Unknown completed-loop ID: ${id}`);
      } else if (COMPLETE_STATUS.test(loop.status) && !hasConcreteReopen) {
        errors.push(`${id} is already ${loop.status}; add a concrete '## Reopen justification' only for a real regression, security finding, or changed requirement.`);
      }
      continue;
    }
    const approved = approvedRows.get(id);
    if (!approved) errors.push(`Unknown next-slice ID: ${id}; add it to docs/19-agent-state.md after review.`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return targets;
}

export function checkRepositoryState() {
  const loopRows = parseLoopLedger(readRequired(LOOP_LEDGER_PATH));
  const approvedRows = parseApprovedSlices(readRequired(STATE_PATH));
  const complete = [...loopRows.values()].filter((row) => COMPLETE_STATUS.test(row.status));
  const pending = [...approvedRows.values()];
  return { complete, pending };
}

function main() {
  const taskFlag = process.argv.indexOf("--task");
  const taskPath = taskFlag >= 0 ? process.argv[taskFlag + 1] : null;
  if (taskFlag >= 0 && (!taskPath || taskPath.startsWith("--"))) {
    throw new Error("Usage: npm run agent:task:check -- .agent/tasks/<task>.md");
  }

  const loopText = readRequired(LOOP_LEDGER_PATH);
  const stateText = readRequired(STATE_PATH);
  const loopRows = parseLoopLedger(loopText);
  const approvedRows = parseApprovedSlices(stateText);

  if (taskPath) {
    const absoluteTaskPath = resolve(ROOT, taskPath);
    const targets = validateTaskTargets(readRequired(absoluteTaskPath), loopRows, approvedRows);
    console.log(`Agent task state check passed: ${targets.join(", ")}`);
    return;
  }

  const complete = [...loopRows.values()].filter((row) => COMPLETE_STATUS.test(row.status));
  console.log(`Agent state gate passed: ${complete.length} completed ledger slices; ${approvedRows.size} approved follow-up slices.`);
  for (const row of approvedRows.values()) console.log(`[${row.status}] ${row.id} — ${row.outcome}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Agent state gate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
