"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "../api/api-client";
import { CheckoutAction } from "./checkout-action";

type Order = { id: string; plan: "STARTER" | "PRO"; amount: number; status: string; canResume?: boolean; canCancel?: boolean; provider?: string };

export function PendingPayment({ workspaceId, onStateChange, onConfirmed, revision }: { workspaceId: string; onStateChange: (state: "loading" | "none" | "pending" | "unknown") => void; onConfirmed: () => void; revision: number }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const load = useCallback(async (isCurrent: () => boolean = () => mounted.current) => {
    const result = await apiRequest<{ order: Order | null }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/orders/latest`);
    if (!isCurrent()) return;
    const next = result?.order;
    if (next && (typeof next.id !== "string" || typeof next.amount !== "number" || (next.plan !== "STARTER" && next.plan !== "PRO") || typeof next.status !== "string")) throw new Error("Invalid payment status.");
    setOrder(next ?? null);
    onStateChange(next ? "pending" : "none");
  }, [workspaceId, onStateChange]);
  useEffect(() => {
    let current = true;
    mounted.current = true;
    void load(() => current).catch(() => { if (current) { onStateChange("unknown"); setMessage("We couldn't load your payment status. Refresh this page or contact Support before starting another payment."); } });
    return () => { current = false; mounted.current = false; };
  }, [load, onStateChange, revision]);
  async function update(action: "reconcile" | "cancel") {
    if (!order) return;
    setBusy(true); setMessage("");
    try {
      const result = await apiRequest<{ status: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/orders/${encodeURIComponent(order.id)}/${action}`, { method: "POST", body: "{}" });
      await load();
      if (mounted.current) {
        setMessage(result.status === "PAID" ? "Payment confirmed. Updating your plan and usage." : result.status === "CANCELLED" || result.status === "EXPIRED" ? "Payment link closed. You may choose a plan again." : "Payment is still being processed. Contact Support if you need help.");
        if (result.status === "PAID") onConfirmed();
      }
    } catch { if (mounted.current) setMessage("We couldn't confirm your payment yet. Check the status or contact Support before paying again."); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (!order && !message) return null;
  return <section className="plan-notice plan-pending" aria-label="Payment status">
    {order && <><div className="plan-pending__details"><strong>{order.canResume ? "Payment link ready" : "Payment status needs checking"} · {order.plan === "PRO" ? "Pro" : "Starter"}</strong><p>{order.amount.toLocaleString("vi-VN")}đ · Your plan will update when your payment is confirmed.</p></div><div className="plan-pending__actions">{order.canResume && <CheckoutAction workspaceId={workspaceId} plan={order.plan} resume resumeMethod={order.provider === "LEMON" ? "card" : "bank"} />}<button type="button" disabled={busy} onClick={() => void update("reconcile")}>Check status</button>{order.canResume && order.canCancel !== false && <button type="button" disabled={busy} onClick={() => void update("cancel")}>Cancel payment link</button>}<Link href="/support">Contact support</Link></div></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
