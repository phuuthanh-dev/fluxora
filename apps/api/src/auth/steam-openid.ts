import { BadRequestException } from "@nestjs/common";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

export function createSteamOpenIdUrl({ returnUri, realm, state }: { returnUri: string; realm: string; state: string }) {
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.search = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${returnUri}${returnUri.includes("?") ? "&" : "?"}state=${encodeURIComponent(state)}`,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  }).toString();
  return url.toString();
}

export async function verifySteamOpenIdCallback(query: Record<string, unknown>) {
  const state = readQueryString(query, "state");
  const endpoint = readQueryString(query, "openid.op_endpoint");
  const claimedId = readQueryString(query, "openid.claimed_id");
  if (endpoint !== STEAM_OPENID_ENDPOINT) throw new BadRequestException({ code: "STEAM_OPENID_INVALID", message: "Steam OpenID provider did not match the expected endpoint." });
  const steamId = steamIdFromClaimedId(claimedId);
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.") && typeof value === "string") parameters.set(key, value);
  }
  parameters.set("openid.mode", "check_authentication");
  const response = await fetch(STEAM_OPENID_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: parameters });
  const body = await response.text();
  if (!response.ok || !/^is_valid:true$/m.test(body)) throw new BadRequestException({ code: "STEAM_OPENID_INVALID", message: "Steam could not validate this OpenID response." });
  return { steamId, state };
}

export function steamIdFromClaimedId(claimedId: string) {
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(765\d{14})$/.exec(claimedId);
  if (!match) throw new BadRequestException({ code: "STEAM_OPENID_INVALID", message: "Steam did not return a valid 64-bit Steam ID." });
  return match[1]!;
}

function readQueryString(query: Record<string, unknown>, name: string) {
  const value = query[name];
  if (typeof value !== "string" || !value) throw new BadRequestException({ code: "STEAM_OPENID_INVALID", message: "Steam OpenID response is incomplete." });
  return value;
}
