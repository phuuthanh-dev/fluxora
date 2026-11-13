"use client";

import { useState } from "react";
import { planCatalog } from "@workflow/contracts";
import { Button, Dialog, DialogHeader } from "../../components/ui";
import { ApiClientError, apiRequest } from "../api/api-client";

export function CheckoutAction({ workspaceId, plan, resume = false, renew = false, upgradeFromPaidUntil, methods = { bank: true, card: false }, resumeMethod }: { workspaceId: string; plan: "STARTER" | "PRO"; resume?: boolean; renew?: boolean; upgradeFromPaidUntil?: string | null; methods?: { bank: boolean; card: boolean }; resumeMethod?: "bank" | "card" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [method, setMethod] = useState<"bank" | "card">(resumeMethod ?? (methods.bank ? "bank" : "card"));
  async function checkout() {
    setPending(true); setError("");
    try {
      const result = await apiRequest<{ checkoutUrl: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/checkout`, { method: "POST", body: JSON.stringify({ plan, method, ...(upgradeFromPaidUntil ? { upgradeFromPaidUntil, confirmUpgrade: true } : {}) }) });
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:" || !(destination.hostname === "pay.payos.vn" || (method === "card" && /^[a-z0-9-]+\.lemonsqueezy\.com$/.test(destination.hostname)))) throw new Error("Invalid checkout address.");
      window.location.assign(destination.toString());
    } catch (reason) {
      setError(reason instanceof ApiClientError && reason.status === 409 ? "Your plan or payment status may have changed. Refresh this page and check before trying again." : "We couldn't open checkout. Check your payment status or contact Support before trying again.");
      setPending(false);
    }
  }
  return <div className="plan-checkout">
    <button type="button" className={`plan-card__link${renew ? " plan-card__link--renew" : ""}`} disabled={pending} onClick={() => upgradeFromPaidUntil || (!resume && methods.bank && methods.card) ? setConfirming(true) : void checkout()}>{pending ? "Opening checkout…" : resume ? "Continue payment" : `${upgradeFromPaidUntil ? "Upgrade to" : renew ? "Renew" : "Choose"} ${plan === "PRO" ? "Pro" : "Starter"}`}</button>
    {error && !confirming && <p role="alert">{error}</p>}
    {confirming && <div className="plan-dialog-backdrop"><Dialog label={upgradeFromPaidUntil ? "Review upgrade" : "Choose payment method"} className="plan-upgrade-dialog" onClose={() => { if (!pending) setConfirming(false); }}>
      <DialogHeader eyebrow={upgradeFromPaidUntil ? "PLAN UPGRADE" : "PAYMENT"} title={upgradeFromPaidUntil ? "Upgrade to Pro?" : "Choose payment method"} onClose={() => { if (!pending) setConfirming(false); }} />
      {upgradeFromPaidUntil && <><p>Pay <strong>{planCatalog.PRO.priceVnd.toLocaleString("vi-VN")}đ</strong> for a new 30-day Pro term. Pro starts when your payment is confirmed.</p>
      <p>Your current Starter term ends then. Its remaining time will not be refunded or added to Pro.</p>
      <p>Your live-run quota resets when the upgrade is confirmed, then resets again on the first day of the next UTC month. Your run history remains available under the retention policy.</p></>}
      {methods.bank && methods.card && <fieldset className="plan-payment-methods"><legend>Payment method</legend><label><input type="radio" name="payment-method" checked={method === "bank"} onChange={() => setMethod("bank")} /> Bank transfer</label><label><input type="radio" name="payment-method" checked={method === "card"} onChange={() => setMethod("card")} /> Bank card</label></fieldset>}
      {error && <p role="alert">{error}</p>}
      <div className="plan-upgrade-dialog__actions"><Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={() => void checkout()}>{pending ? "Opening checkout…" : "Continue to payment"}</Button></div>
    </Dialog></div>}
  </div>;
}
