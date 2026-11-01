import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";

type ResolveHost = (hostname: string) => Promise<string[]>;
type ResolveSocketHost = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>;

type PolicyDependencies = {
  resolveHost?: ResolveHost;
  fetchImplementation?: FetchImplementation;
  dispatcher?: Agent;
};

export class OutboundRequestPolicyError extends Error {
  constructor(readonly code: "OUTBOUND_URL_BLOCKED" | "OUTBOUND_REDIRECT_BLOCKED", message: string) {
    super(message);
  }
}

/** Validate the actual socket addresses, not only an earlier DNS lookup. */
export function createSafeSocketLookup(resolve: ResolveSocketHost = resolveSocketHost): LookupFunction {
  return (hostname, options, callback) => {
    void (async () => {
      const normalized = stripIpv6Brackets(hostname).toLowerCase();
      if (!normalized || isBlockedHostname(normalized)) throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
      const addresses = await resolve(normalized);
      if (!addresses.length || (!isAllowedHostname(normalized) && addresses.some(({ address }) => isBlockedAddress(address)))) {
        throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
      }
      const family = Number(options.family) || 0;
      const candidates = addresses.filter((item) => family === 0 || item.family === family);
      if (!candidates.length) {
        const error: NodeJS.ErrnoException = new Error("No suitable address for outbound target.");
        error.code = "ENOTFOUND";
        throw error;
      }
      if (options.all) callback(null, candidates);
      else callback(null, candidates[0]!.address, candidates[0]!.family);
    })().catch((error: unknown) => callback(error instanceof Error ? error : new Error("Outbound resolution failed."), "", 0));
  };
}

const safeDispatcher = new Agent({ connect: { lookup: createSafeSocketLookup() } });

export async function assertSafeOutboundUrl(rawUrl: string, dependencies: Pick<PolicyDependencies, "resolveHost"> = {}) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
  }
  if (url.username || url.password) {
    throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
  }
  await assertSafeOutboundHostname(url.hostname, dependencies);
  return url;
}

/**
 * Applies Fluxora's outbound-network boundary to a DNS hostname without
 * accepting a URL. SMTP uses this before constructing its own TCP transport.
 * The function intentionally returns no resolved address: callers must not log
 * or retain network-target detail in execution history.
 */
export async function assertSafeOutboundHostname(rawHostname: string, dependencies: Pick<PolicyDependencies, "resolveHost"> = {}) {
  const hostname = stripIpv6Brackets(rawHostname).toLowerCase();
  if (!hostname || isBlockedHostname(hostname)) {
    throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
  }
  if (isAllowedHostname(hostname)) return;

  const addresses = isIP(hostname) ? [hostname] : await (dependencies.resolveHost ?? resolvePublicHost)(hostname);
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new OutboundRequestPolicyError("OUTBOUND_URL_BLOCKED", "Outbound request target is not permitted.");
  }
}

export async function fetchSafeOutbound(rawUrl: string, init: RequestInit = {}, dependencies: PolicyDependencies = {}) {
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  let currentUrl = await assertSafeOutboundUrl(rawUrl, dependencies);
  let requestInit: RequestInit = { ...init, redirect: "manual" };

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    // Node's bundled fetch and the installed Undici dispatcher use compatible
    // runtime interfaces, but their independent declaration versions differ.
    const dispatchInit = { ...requestInit, dispatcher: dependencies.dispatcher ?? safeDispatcher } as unknown as RequestInit;
    const response = await fetchImplementation(currentUrl, dependencies.fetchImplementation ? requestInit : dispatchInit);
    if (!isRedirect(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel();
    const nextUrl = await assertSafeOutboundUrl(new URL(location, currentUrl).toString(), dependencies);
    if (nextUrl.origin !== currentUrl.origin) {
      throw new OutboundRequestPolicyError("OUTBOUND_REDIRECT_BLOCKED", "Outbound redirect target is not permitted.");
    }
    currentUrl = nextUrl;
    if (shouldRewriteToGet(response.status, requestInit.method)) requestInit = { ...requestInit, method: "GET", body: undefined };
  }

  throw new OutboundRequestPolicyError("OUTBOUND_REDIRECT_BLOCKED", "Outbound request redirected too many times.");
}

async function resolvePublicHost(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => entry.address);
}

async function resolveSocketHost(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function shouldRewriteToGet(status: number, method: string | undefined) {
  const normalized = (method ?? "GET").toUpperCase();
  return status === 303 || ((status === 301 || status === 302) && normalized === "POST");
}

function isBlockedHostname(hostname: string) {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function isAllowedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (process.env.OUTBOUND_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && item !== "*")
    .some((pattern) => pattern.startsWith("*.") ? normalized.endsWith(pattern.slice(1)) : normalized === pattern);
}

export function isBlockedAddress(address: string) {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  if (!isIP(normalized)) return true;
  const parsed = ipaddr.process(normalized);
  if (parsed.kind() === "ipv4") return parsed.range() !== "unicast" || isBlockedIpv4(parsed.toString());
  // Restrict IPv6 to global-unicast space, excluding the special-purpose
  // 2001::/23 block even where a library labels its subranges as unicast.
  return parsed.range() !== "unicast"
    || !parsed.match(ipaddr.IPv6.parse("2000::"), 3)
    || parsed.match(ipaddr.IPv6.parse("2001::"), 23);
}

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  const first = octets[0];
  const second = octets[1];
  const third = octets[2];
  if (first === undefined || second === undefined || third === undefined || octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

function stripIpv6Brackets(value: string) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}
