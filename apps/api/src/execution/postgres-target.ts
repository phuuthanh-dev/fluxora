import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedAddress } from "./outbound-url-policy";
import { NodeFailure } from "./node-failure";

/** Resolve once and pin the returned public address when constructing the socket.
 * Callers must also preserve the original hostname for TLS certificate checking.
 */
export async function resolvePostgresTarget(host: string, resolve: typeof lookup = lookup) {
  if (typeof host !== "string" || host.length > 253 || isIP(host) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(host)) throw new NodeFailure("OUTBOUND_URL_BLOCKED", "Enter a public PostgreSQL hostname.", false);
  let addresses: Array<{ address: string; family: number }>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    addresses = await Promise.race([
      resolve(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new NodeFailure("TIMEOUT", "PostgreSQL DNS lookup timed out.", true)), 5_000); }),
    ]);
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("NETWORK_ERROR", "PostgreSQL host could not be resolved.", true);
  } finally { if (timer) clearTimeout(timer); }
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) throw new NodeFailure("OUTBOUND_URL_BLOCKED", "PostgreSQL target is not permitted.", false);
  return { address: addresses[0]!.address, servername: host };
}
