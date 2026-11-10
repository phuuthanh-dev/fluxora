import { NodeFailure } from "../execution/node-failure";
import { readBoundedProviderJson } from "../execution/provider-json";
import { jiraAccountId } from "./jira-oauth";

type Result = { action: "closed" | "updated" | null; cycleDays: number } | { retrySeconds: number };

/** Report one account, with no provider response or token included in errors. */
export async function reportJiraPrivacyAccount(token: string, accountId: string, oldestDataAt: Date, transport: typeof fetch = fetch): Promise<Result> {
  if (!token || !jiraAccountId(accountId) || !Number.isFinite(oldestDataAt.getTime())) throw new Error("INVALID_REPORT_INPUT");
  const response = await transport("https://api.atlassian.com/app/report-accounts/", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ accounts: [{ accountId, updatedAt: oldestDataAt.toISOString() }] }),
  });
  if (response.status === 401) { await response.body?.cancel(); throw new NodeFailure("HTTP_ERROR", "Jira reporting authorization failed.", false, 401); }
  if (response.status === 429) {
    const retry = response.headers.get("retry-after");
    await response.body?.cancel();
    if (!retry || !/^\d{1,7}$/.test(retry)) throw new Error("INVALID_RETRY_AFTER");
    return { retrySeconds: Math.max(1, Number(retry)) };
  }
  if (response.status !== 200 && response.status !== 204) { await response.body?.cancel(); throw new Error("REPORT_NOT_CONFIRMED"); }
  const header = response.headers.get("cycle-period");
  if (header !== null && (!/^\d{1,3}$/.test(header) || Number(header) < 1)) throw new Error("INVALID_CYCLE_PERIOD");
  const cycleDays = header === null ? 7 : Number(header);
  if (response.status === 204) return { action: null, cycleDays };
  const value = await readBoundedProviderJson(response);
  const accounts = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).accounts : null;
  if (!Array.isArray(accounts) || accounts.length !== 1 || !accounts[0] || typeof accounts[0] !== "object" || accounts[0].accountId !== accountId || !["closed", "updated"].includes(accounts[0].status)) throw new Error("INVALID_REPORT_RESPONSE");
  return { action: accounts[0].status as "closed" | "updated", cycleDays };
}
