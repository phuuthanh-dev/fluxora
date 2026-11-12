"use client";

import { useState } from "react";
import { ApiClientError, apiRequest } from "../api/api-client";

export function CheckoutAction({ workspaceId, plan, resume = false }: { workspaceId: string; plan: "STARTER" | "PRO"; resume?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    setPending(true); setError("");
    try {
      const result = await apiRequest<{ checkoutUrl: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/checkout`, { method: "POST", body: JSON.stringify({ plan }) });
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:" || destination.hostname !== "pay.payos.vn") throw new Error("Invalid checkout address.");
      window.location.assign(destination.toString());
    } catch (reason) {
      setError(reason instanceof ApiClientError && reason.status === 409 ? "A payment needs attention. Check its status above before choosing a plan." : "We couldn't open payOS. Check your payment status or contact Support before trying again.");
      setPending(false);
    }
  }
  return <div className="plan-checkout"><button type="button" className="plan-card__link" disabled={pending} onClick={() => void checkout()}>{pending ? "Opening payOS…" : resume ? "Continue to payOS" : `Choose ${plan === "PRO" ? "Pro" : "Starter"}`}</button>{error && <p role="alert">{error}</p>}</div>;
}
