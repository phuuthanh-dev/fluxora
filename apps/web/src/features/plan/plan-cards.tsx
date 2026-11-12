import { Check } from "lucide-react";
import Link from "next/link";
import { planCatalog, type PlanCode } from "@workflow/contracts";
import "./plan-usage.css";
import { CheckoutAction } from "./checkout-action";

/** Public and workspace views share the same provisional catalogue. */
export function PlanCards({ current, workspaceId, checkoutAvailable = false, publicCheckout = false, paymentBlocked = false }: { current?: PlanCode; workspaceId?: string; checkoutAvailable?: boolean; publicCheckout?: boolean; paymentBlocked?: boolean }) {
  return <div className="plan-cards">{(["FREE", "STARTER", "PRO"] as const).map((code) => {
    const item = planCatalog[code];
    return <article className={`plan-card${current === code ? " plan-card--current" : ""}`} key={code}>
      <div className="plan-card__heading"><h3>{item.name}</h3>{current === code && <span>Current</span>}</div>
      <p className="plan-card__price">{item.priceVnd.toLocaleString("vi-VN")}<small>đ / {code === "FREE" ? "month" : "30 days"}</small></p>
      <p className="plan-card__sub">{code === "FREE" ? "For your first workflows" : code === "STARTER" ? "For regular automation" : "For more frequent runs"}</p>
      <ul>
        <li><Check size={15} aria-hidden="true" />{item.monthlyRuns.toLocaleString("vi-VN")} {checkoutAvailable || publicCheckout ? "" : "proposed "}live runs / month</li>
        <li><Check size={15} aria-hidden="true" />{item.activeWorkflows} {checkoutAvailable || publicCheckout ? "" : "proposed "}active workflows</li>
        <li><Check size={15} aria-hidden="true" />{item.concurrentRuns} {checkoutAvailable || publicCheckout ? "" : "proposed "}concurrent {item.concurrentRuns === 1 ? "run" : "runs"}</li>
        <li><Check size={15} aria-hidden="true" />Visual editor and supported integrations</li>
        <li><Check size={15} aria-hidden="true" />Use your own AI provider keys</li>
      </ul>
      {current ? checkoutAvailable && workspaceId && code !== "FREE" ? paymentBlocked ? <p className="plan-card__foot">Check the payment status above before choosing a plan.</p> : <CheckoutAction workspaceId={workspaceId} plan={code} /> : <p className="plan-card__foot">{current === code ? "Your current plan" : "Not available for purchase"}</p> : code === "FREE" ? <Link className="plan-card__link" href="/register">Get started</Link> : publicCheckout ? <Link className="plan-card__link" href="/dashboard/plan">Choose {item.name}</Link> : <p className="plan-card__foot">Coming soon · no payment available yet</p>}
    </article>;
  })}</div>;
}
