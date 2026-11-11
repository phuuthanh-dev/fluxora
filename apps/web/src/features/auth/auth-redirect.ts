const fallback = "/dashboard";
const oauthReturnKey = "fluxora-auth-return";

/** Only private, same-origin application routes may be used as return destinations. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f\x7f]|%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return fallback;
  try {
    const url = new URL(value, "https://fluxora.invalid");
    if (url.origin !== "https://fluxora.invalid" || !["/dashboard", "/editor", "/settings/account", "/admin"].some((base) => url.pathname === base || url.pathname.startsWith(`${base}/`))) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function loginHref(location: Pick<Location, "pathname" | "search" | "hash">): string {
  const destination = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
  return `/login?${new URLSearchParams({ next: destination })}`;
}

export function rememberOAuthReturn(destination: string) {
  try { sessionStorage.setItem(oauthReturnKey, safeReturnTo(destination)); } catch { /* Login still works without browser storage. */ }
}

export function authReturnFromLocation(search: string): string {
  const params = new URLSearchParams(search);
  const explicit = params.get("next");
  if (explicit !== null) return safeReturnTo(explicit);
  if (params.has("authError")) {
    try { return safeReturnTo(sessionStorage.getItem(oauthReturnKey)); } catch { /* Fall back when browser storage is unavailable. */ }
  }
  return fallback;
}

export function consumeOAuthReturn(): string {
  try {
    const value = sessionStorage.getItem(oauthReturnKey);
    sessionStorage.removeItem(oauthReturnKey);
    return safeReturnTo(value);
  } catch { return fallback; }
}
