import { NodeFailure } from "./node-failure";

// A continuation remains opaque to callers; accept Sentry's documented numeric cursor form only.
export const sentryCursorValid = (value: unknown): value is string => typeof value === "string" && /^-?[0-9]{1,20}:[0-9]{1,20}:[01]$/.test(value);

function invalidLink(): never { throw new NodeFailure("INVALID_RESPONSE", "Sentry returned invalid pagination metadata.", false); }
export function sentryNextLink(header: string | null, requestUrl: string): { hasMore: boolean | null; cursor: string | null } {
  if (!header) return { hasMore: null, cursor: null };
  if (header.length > 8192) return invalidLink();
  const entries = header.split(/,(?=\s*<)/);
  let next: { url: string; attributes: Map<string, string> } | undefined;
  for (const entry of entries) {
    const match = entry.match(/^\s*<([^<>]+)>((?:\s*;\s*[A-Za-z][A-Za-z0-9_-]*="[^"\r\n]*")*)\s*$/);
    if (!match) return invalidLink();
    const attrs = new Map<string, string>();
    const attrPattern = /;\s*([A-Za-z][A-Za-z0-9_-]*)="([^"\r\n]*)"/g;
    for (const part of match[2]!.matchAll(attrPattern)) {
      const key = part[1]!.toLowerCase();
      if (attrs.has(key)) return invalidLink();
      attrs.set(key, part[2]!);
    }
    const rel = attrs.get("rel");
    if (rel !== "next" && rel !== "previous") return invalidLink();
    if (rel === "next") {
      if (next) return invalidLink();
      next = { url: match[1]!, attributes: attrs };
    }
  }
  if (!next) return invalidLink();
  let target: URL;
  try { target = new URL(next.url); } catch { return invalidLink(); }
  const request = new URL(requestUrl);
  if (target.origin !== request.origin || target.pathname !== request.pathname || target.username || target.password || target.hash) return invalidLink();
  const expected = new URLSearchParams(request.search);
  expected.delete("cursor");
  const targetParams = new URLSearchParams(target.search);
  const values = targetParams.getAll("cursor");
  targetParams.delete("cursor");
  if (values.length !== 1 || !sentryCursorValid(values[0]) || [...targetParams.keys()].some((key) => targetParams.getAll(key).length !== 1) || [...expected.keys()].some((key) => expected.getAll(key).length !== 1) || [...targetParams].length !== [...expected].length || [...expected].some(([key, value]) => targetParams.get(key) !== value)) return invalidLink();
  const attrCursor = next.attributes.get("cursor");
  if (attrCursor !== undefined && attrCursor !== values[0]) return invalidLink();
  const results = next.attributes.get("results");
  if (results !== "true" && results !== "false") return invalidLink();
  return { hasMore: results === "true", cursor: results === "true" ? values[0]! : null };
}
