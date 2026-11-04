import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { isBlockedAddress, OutboundRequestPolicyError } from "./outbound-url-policy";

type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<Address[]>;
type Dependencies = { resolver?: Resolver; fetchImplementation?: typeof fetch };
const blocked = () => new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Use a public HTTP or HTTPS feed URL without credentials or secret query parameters.");
const redirectBlocked = () => new OutboundRequestPolicyError("OUTBOUND_REDIRECT_BLOCKED", "The feed redirected to an unsupported address.");
const secretParameter = /(?:^|[_-])(access[_-]?token|api[_-]?key|authorization|credential|password|secret|signature|sig|token)(?:$|[_-])/i;
let outstandingLookups = 0;

export const isSensitiveRssParameter = (name: string) => secretParameter.test(name) || /^x-amz-/i.test(name);

/** Syntax-only validation is safe during draft editing; it never resolves DNS. */
export function parsePublicRssUrl(value: unknown): URL {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value) || /%(?![0-9a-f]{2})/i.test(value) || !/^https?:\/\//i.test(value)) throw blocked();
  let url: URL;
  try { url = new URL(value); } catch { throw blocked(); }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || !host || url.username || url.password || url.hash || host === "localhost" || host.endsWith(".localhost") || (isIP(host) && isBlockedAddress(host))) throw blocked();
  // Public feeds often use normal query parameters. Signed/private feeds need
  // a credential mechanism rather than embedding recognizable secrets here.
  for (const name of url.searchParams.keys()) if (isSensitiveRssParameter(name)) throw blocked();
  return url;
}

async function resolvePublic(hostname: string, resolver: Resolver = async (host) => lookup(host, { all: true, verbatim: true })): Promise<Address[]> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) throw blocked();
  const family = isIP(host);
  if (family) {
    if (isBlockedAddress(host)) throw blocked();
    return [{ address: host, family }];
  }
  // Keep unresolved DNS calls bounded even if the operating system ignores
  // the timeout. A completed or rejected lookup always releases its slot.
  if (outstandingLookups >= 8) throw new Error("RSS DNS lookup is temporarily unavailable.");
  outstandingLookups++;
  const pending = Promise.resolve().then(() => resolver(host)).finally(() => { outstandingLookups--; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => { const error = new Error("RSS DNS lookup timed out."); error.name = "TimeoutError"; reject(error); }, 3000); })]);
    if (!addresses.length || addresses.some((entry) => isBlockedAddress(entry.address))) throw blocked();
    return addresses;
  } catch (error) {
    if (error instanceof OutboundRequestPolicyError || (error instanceof Error && error.name === "TimeoutError")) throw error;
    throw new Error("RSS DNS lookup is temporarily unavailable.");
  }
  finally { if (timer) clearTimeout(timer); }
}

export async function assertPublicRssUrl(value: unknown, resolver?: Resolver) {
  const url = parsePublicRssUrl(value);
  await resolvePublic(url.hostname, resolver);
  return url;
}

/** Enforce the same public-address boundary at connection time, without the
 * general outbound allowlist: a feed cannot use an internal hostname alias. */
export function rssPublicSocketLookup(resolver?: Resolver): LookupFunction {
  return (hostname, options, callback) => {
    void resolvePublic(hostname, resolver).then((all) => {
      const family = Number(options.family) || 0;
      const candidates = all.filter((item) => !family || item.family === family);
      if (!candidates.length) throw blocked();
      if (options.all) callback(null, candidates);
      else callback(null, candidates[0]!.address, candidates[0]!.family);
    }).catch((error: unknown) => callback(error instanceof OutboundRequestPolicyError ? error : new Error("RSS DNS lookup is temporarily unavailable."), "", 0));
  };
}

const dispatcher = new Agent({ connect: { lookup: rssPublicSocketLookup() } });

/** A bounded same-origin redirect chain; no provider-controlled URL bypasses
 * syntax, DNS or socket checks. Request content is never echoed in errors. */
export async function fetchPublicRss(raw: string, init: RequestInit, dependencies: Dependencies = {}) {
  if ((init.method ?? "GET").toUpperCase() !== "GET" || init.body != null) throw blocked();
  // A timeout is a transient transport failure, not an outbound policy
  // violation. Preserve the signal's reason so a poll can be retried instead
  // of permanently disabling the checkpoint during a redirect chain.
  init.signal?.throwIfAborted();
  let current = await assertPublicRssUrl(raw, dependencies.resolver);
  const origin = current.origin;
  for (let count = 0; count <= 5; count++) {
    init.signal?.throwIfAborted();
    const response = await (dependencies.fetchImplementation ?? fetch)(current, { ...init, redirect: "manual", ...(dependencies.fetchImplementation ? {} : { dispatcher }) } as unknown as RequestInit);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || count === 5) throw redirectBlocked();
    let next: URL;
    try { next = new URL(location, current); } catch { throw redirectBlocked(); }
    if (next.origin !== origin) throw redirectBlocked();
    current = await assertPublicRssUrl(next.href, dependencies.resolver);
  }
  throw redirectBlocked();
}
