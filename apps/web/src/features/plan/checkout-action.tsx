"use client";

import { useState } from "react";
import { planCatalog } from "@workflow/contracts";
import { Button, Dialog, DialogHeader } from "../../components/ui";
import { ApiClientError, apiRequest } from "../api/api-client";

export function CheckoutAction({ workspaceId, plan, resume = false, renew = false, upgradeFromPaidUntil }: { workspaceId: string; plan: "STARTER" | "PRO"; resume?: boolean; renew?: boolean; upgradeFromPaidUntil?: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  async function checkout() {
    setPending(true); setError("");
    try {
      const result = await apiRequest<{ checkoutUrl: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/checkout`, { method: "POST", body: JSON.stringify({ plan, ...(upgradeFromPaidUntil ? { upgradeFromPaidUntil, confirmUpgrade: true } : {}) }) });
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:" || destination.hostname !== "pay.payos.vn") throw new Error("Invalid checkout address.");
      window.location.assign(destination.toString());
    } catch (reason) {
      setError(reason instanceof ApiClientError && reason.status === 409 ? "Your plan or payment status may have changed. Refresh this page and check before trying again." : "We couldn't open payOS. Check your payment status or contact Support before trying again.");
      setPending(false);
    }
  }
  return <div className="plan-checkout">
    <button type="button" className={`plan-card__link${renew ? " plan-card__link--renew" : ""}`} disabled={pending} onClick={() => upgradeFromPaidUntil ? setConfirming(true) : void checkout()}>{pending ? "Opening payOS…" : resume ? "Continue to payOS" : `${upgradeFromPaidUntil ? "Upgrade to" : renew ? "Renew" : "Choose"} ${plan === "PRO" ? "Pro" : "Starter"}`}</button>
    {error && !confirming && <p role="alert">{error}</p>}
    {confirming && <div className="plan-dialog-backdrop"><Dialog label="Review upgrade" className="plan-upgrade-dialog" onClose={() => { if (!pending) setConfirming(false); }}>
      <DialogHeader eyebrow="PLAN UPGRADE" title="Upgrade to Pro?" onClose={() => { if (!pending) setConfirming(false); }} />
      <p>Pay <strong>{planCatalog.PRO.priceVnd.toLocaleString("vi-VN")}đ</strong> for a new 30-day Pro term. Pro starts when payOS confirms your payment.</p>
      <p>Your current Starter term ends then. Its remaining time will not be refunded or added to Pro.</p>
      <p>Your live-run quota resets when the upgrade is confirmed, then resets again on the first day of the next UTC month. Your run history remains available under the retention policy.</p>
      {error && <p role="alert">{error}</p>}
      <div className="plan-upgrade-dialog__actions"><Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={() => void checkout()}>{pending ? "Opening payOS…" : "Agree and continue to payOS"}</Button></div>
    </Dialog></div>}
  </div>;
}
