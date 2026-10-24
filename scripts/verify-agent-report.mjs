import { existsSync, readFileSync } from "node:fs";

const reportPath = process.argv[2];
const requiredHeadings = [
  "## Outcome",
  "## Commit and scope",
  "## Acceptance criteria",
  "## Validation receipts",
  "## Files changed",
  "## Risks and follow-up"
];

if (!reportPath || !existsSync(reportPath)) {
  console.error("Usage: npm run harness:report -- <report.md>");
  process.exitCode = 1;
} else {
  const report = readFileSync(reportPath, "utf8");
  const missing = requiredHeadings.filter((heading) => !report.includes(heading));
  if (missing.length > 0) {
    console.error(`Agent report is missing required sections: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else if (report.length > 12_000) {
    console.error("Agent report exceeds 12,000 characters. Keep the handoff concise and point to commits/logs.");
    process.exitCode = 1;
  } else {
    console.log("Agent report format is valid. Review the referenced diff and test receipts independently.");
  }
}
