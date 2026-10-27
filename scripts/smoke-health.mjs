import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowedProtocols = new Set(["http:", "https:"]);

function safeOrigin(raw, label) {
  const parsed = new URL(raw);
  if (!allowedProtocols.has(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTP(S) origin without credentials, query, or fragment.`);
  }
  return parsed.origin;
}

export function healthTargets({
  apiOrigin = "http://127.0.0.1:3001",
  webOrigin = "http://127.0.0.1:3000",
} = {}) {
  const api = safeOrigin(apiOrigin, "API origin");
  const web = safeOrigin(webOrigin, "Web origin");
  return [
    { name: "API liveness", url: `${api}/api/v1/health` },
    { name: "API readiness", url: `${api}/api/v1/health/ready` },
    { name: "Web root", url: `${web}/` },
  ];
}

export async function runHealthSmoke(options = {}) {
  const targets = healthTargets(options);
  const results = [];
  for (const target of targets) {
    try {
      const response = await fetch(target.url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json, text/html;q=0.8" },
      });
      results.push({ ...target, ok: response.ok, status: response.status });
    } catch (error) {
      results.push({ ...target, ok: false, status: null, error: error instanceof Error ? error.message : "Request failed" });
    }
  }
  return results;
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {
    apiOrigin: argument("--api-origin", "http://127.0.0.1:3001"),
    webOrigin: argument("--web-origin", "http://127.0.0.1:3000"),
  };
  try {
    const targets = healthTargets(options);
    if (process.argv.includes("--dry-run")) {
      console.log(JSON.stringify({ mode: "dry-run", method: "GET", targets }, null, 2));
    } else {
      const results = await runHealthSmoke(options);
      console.log(JSON.stringify({ mode: "health-only", method: "GET", results }, null, 2));
      if (results.some((entry) => !entry.ok)) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Health smoke failed");
    process.exitCode = 1;
  }
}
