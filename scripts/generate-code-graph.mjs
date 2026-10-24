import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputPath = join(repositoryRoot, "docs", "11-code-graph.json");
const sourceRoots = ["apps/api/src", "apps/web/src", "packages/workflow-contracts/src"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredSuffixes = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".d.ts"];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(entryPath);
      if (!entry.isFile() || !sourceExtensions.has(extname(entry.name)) || ignoredSuffixes.some((suffix) => entry.name.endsWith(suffix))) return [];
      return [entryPath];
    })
    .sort();
}

function sourceId(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function resolveRelativeImport(fromPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const candidate = resolve(dirname(fromPath), specifier);
  const candidates = [candidate, ...[".ts", ".tsx"].map((extension) => `${candidate}${extension}`), ...["index.ts", "index.tsx"].map((indexFile) => join(candidate, indexFile))];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function importSpecifiers(source) {
  const matches = source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g);
  return [...matches].map((match) => match[1] ?? match[2]).filter((value) => value !== undefined);
}

function boundary(path) {
  if (path.startsWith("apps/api/")) return "api";
  if (path.startsWith("apps/web/")) return "web";
  return "contracts";
}

function graph() {
  const files = sourceRoots.flatMap((sourceRoot) => sourceFiles(join(repositoryRoot, sourceRoot)));
  const knownIds = new Set(files.map(sourceId));
  const nodes = files.map((path) => {
    const id = sourceId(path);
    const internalImports = [];
    const externalImports = [];
    for (const specifier of importSpecifiers(readFileSync(path, "utf8"))) {
      const resolved = resolveRelativeImport(path, specifier);
      if (resolved) {
        const target = sourceId(resolved);
        if (knownIds.has(target)) internalImports.push(target);
      } else if (!specifier.startsWith(".")) {
        externalImports.push(specifier);
      }
    }
    return {
      id,
      boundary: boundary(id),
      internalImports: [...new Set(internalImports)].sort(),
      externalImports: [...new Set(externalImports)].sort()
    };
  });
  const edges = nodes.flatMap((node) => node.internalImports.map((target) => ({ from: node.id, to: target }))).sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`));
  return {
    schemaVersion: 1,
    sourceRoots,
    generatedBy: "scripts/generate-code-graph.mjs",
    boundaries: {
      api: "NestJS server, persistence, provider calls, scheduler, execution worker",
      web: "Next.js browser UI; no provider secrets or provider calls",
      contracts: "Shared workflow graph and node DTOs; no app-specific dependencies"
    },
    entryPoints: [
      "apps/api/src/main.ts",
      "apps/api/src/worker.ts",
      "apps/web/src/app/page.tsx",
      "apps/web/src/app/dashboard/page.tsx",
      "apps/web/src/app/editor/page.tsx"
    ],
    nodes,
    edges
  };
}

const rendered = `${JSON.stringify(graph(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== rendered) {
    console.error("Code graph is stale. Run: npm run codegraph:generate");
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, rendered);
  console.log(`Wrote ${sourceId(outputPath)}`);
}
