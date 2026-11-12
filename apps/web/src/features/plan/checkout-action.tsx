"use client";

import { useState } from "react";
import { apiRequest } from "../api/api-client";

export function CheckoutAction({ workspaceId, plan }: { workspaceId: string; plan: "STARTER" | "PRO" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    setPending(true); setError("");
    try {
      const result = await apiRequest<{ checkoutUrl: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/checkout`, { method: "POST", body: JSON.stringify({ plan }) });
      const destination = new URL(result.checkoutUrl);
      if (destination.protocol !== "https:" || destination.hostname !== "pay.payos.vn") throw new Error("Invalid checkout address.");
      window.location.assign(destination.toString());
    } catch {
      setError("Could not open checkout. Please contact support before retrying.");
      setPending(false);
    }
  }
  return <div className="plan-checkout"><button type="button" className="plan-card__link" disabled={pending} onClick={() => void checkout()}>{pending ? "Opening checkout…" : `Choose ${plan === "PRO" ? "Pro" : "Starter"}`}</button>{error && <p role="alert">{error}</p>}</div>;
}
