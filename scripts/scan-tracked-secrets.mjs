import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

// These are deliberately high-confidence patterns. This is a release guard,
// not a replacement for GitHub secret scanning or an independent audit.
const patterns = [
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "Telegram bot token", pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ },
  { name: "GitHub personal token", pattern: /\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Discord webhook URL", pattern: /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/i },
  { name: "Google Chat webhook URL", pattern: /https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^\s"']+\/messages\?(?:[^\s"']*\b(?:key|token)=[A-Za-z0-9_-]{20,})/i },
  { name: "non-placeholder encryption key", pattern: /^\s*APP_ENCRYPTION_KEY\s*=\s*(?!$|replace-with|base64-encoded|example|your-)[^\s#]+/im },
];

const allowedFiles = new Set([".env.example", "infra/.env.production.example"]);
const scannerFile = "scripts/scan-tracked-secrets.mjs";

export function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
}

export function scanContent(content, relativePath) {
  const findings = [];
  if (content.includes("\0")) return findings;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { name, pattern } of patterns) {
      if (pattern.test(line)) {
        findings.push({ file: relativePath, line: index + 1, pattern: name });
      }
      pattern.lastIndex = 0;
    }
  });
  return findings;
}

export function scanTrackedFiles(files = trackedFiles()) {
  const findings = [];
  for (const relativePath of files) {
    if (allowedFiles.has(relativePath) || relativePath.endsWith(".lock") || relativePath === scannerFile) continue;
    try {
      findings.push(...scanContent(readFileSync(resolve(root, relativePath), "utf8"), relativePath));
    } catch {
      // A stale/non-file Git entry is outside this source scan's scope.
    }
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanTrackedFiles();
  if (findings.length > 0) {
    console.error(`Tracked secret scan failed with ${findings.length} high-confidence finding(s):`);
    for (const finding of findings) console.error(`- ${finding.file}:${finding.line} (${finding.pattern})`);
    process.exitCode = 1;
  } else {
    console.log("Tracked secret scan passed: no high-confidence secret pattern found.");
  }
}
