import { PlanCards } from "../../features/plan/plan-cards";
import { PublicSection, PublicShell } from "../../features/public-site/public-shell";
import { publicMetadata } from "../../features/public-site/site";

export const metadata = publicMetadata("Pricing", "Explore Fluxora workspace plans and learn how workflow runs are counted.", "/pricing");
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  let available = false;
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1"}/billing/availability`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (response.ok) available = (await response.json() as { available?: boolean }).available === true;
  } catch { /* Do not advertise checkout when availability cannot be confirmed. */ }
  return <PublicShell eyebrow={available ? "Pricing · per workspace" : "Pricing · early access"} title="More flow, on your terms." description={available ? "Choose the workspace plan that fits your workflows. Paid access lasts 30 days and renews only when you choose to pay again." : "Explore the proposed plans for a Fluxora workspace. There are no charges or enforced plan limits during early access."}>
    <PlanCards publicCheckout={available} />
    <p className="pricing-note">{available ? "Paid plans are prepaid for 30 days with no automatic renewal. Upgrading to Pro costs the full Pro price and starts a new term and live-run allowance; remaining Starter time ends without credit. The regular allowance reset is on the first of each UTC month. Connected services and AI providers may charge separately." : "Prices and benefits are proposals, not yet available for purchase. Connected services and AI providers may charge separately."}</p>
    <div className="pricing-questions">
      <PublicSection id="included" title="Built for work you can follow"><p>Build visually, test with mock data, inspect execution details, and connect supported apps using your own accounts. Fluxora can also be self-hosted; self-hosted infrastructure is separate from these hosted plans.</p></PublicSection>
      <PublicSection id="runs" title="What is a workflow run?"><p>A live run starts a workflow using real data. One run can include multiple steps. Mock runs do not call connected services.</p><p>{available ? "The run allowance resets at the beginning of each UTC calendar month. Live manual and node-debug runs count; mock runs do not." : "Usage shown today is based on retained execution history and may be incomplete. It is not used for billing."}</p></PublicSection>
      <PublicSection id="access" title="What happens when I reach a limit?"><p>{available ? "New live runs stop until the next UTC month. Existing running workflows are not interrupted. Contact Support to request a refund; requests are reviewed individually." : "Limits are not enforced during early access. Before paid plans launch, we will explain how limits, renewal and cancellations work."}</p></PublicSection>
    </div>
  </PublicShell>;
}
