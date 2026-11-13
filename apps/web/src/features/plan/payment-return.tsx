"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../api/api-client";
import { Status } from "../../components/ui";

/** Never interpret query-string status as payment confirmation. */
export function PaymentReturn({ workspaceId, orderId, onConfirmed }: { workspaceId: string; orderId: string; onConfirmed: () => void }) {
  const [message, setMessage] = useState("Checking your payment with payOS…");
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ status: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/orders/${encodeURIComponent(orderId)}/reconcile`, { method: "POST", body: "{}", signal: controller.signal })
      .then((order) => {
        if (controller.signal.aborted) return;
        setMessage(order.status === "PAID" ? "Payment confirmed. Updating your plan and usage." : order.status === "CANCELLED" || order.status === "EXPIRED" ? "This payment link is no longer active. You may choose a plan again." : "Payment is not confirmed yet. Refresh later or contact Support if you need help.");
        if (order.status === "PAID") onConfirmed();
      }).catch(() => { if (!controller.signal.aborted) setMessage("We couldn't confirm payment yet. Refresh later or contact Support before making another payment."); });
    return () => controller.abort();
  }, [workspaceId, orderId, onConfirmed]);
  return <Status tone="info" className="plan-return-status">{message}</Status>;
}
