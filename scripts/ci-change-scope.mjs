import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Only documentation in known documentation locations is ignored. Markdown
// under an app or infrastructure can be runtime input, so it requires verify.
export function isDocumentationOnlyPath(path) {
  return path === "LICENSE" || /^[^/]+\.md$/i.test(path) || /^(?:docs|\.agent)\/.+\.md$/i.test(path);
}

export function classifyChange(base, head, cwd = process.cwd()) {
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) throw new Error("Expected full lowercase commit SHAs");
  const output = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, head, "--"], { cwd });
  const paths = output.toString("utf8").split("\0").filter(Boolean);
  return { hasChanges: paths.length > 0, product: paths.some((path) => !isDocumentationOnlyPath(path)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = classifyChange(process.argv[2] ?? "", process.argv[3] ?? "");
    process.stdout.write(result.product ? "product\n" : "docs-only\n");
  } catch {
    process.stderr.write("Cannot classify the complete Git diff. Verification must not be skipped.\n");
    process.exitCode = 1;
  }
}
