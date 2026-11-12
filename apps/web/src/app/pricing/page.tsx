import { PlanCards } from "../../features/plan/plan-cards";
import { PublicSection, PublicShell } from "../../features/public-site/public-shell";
import { publicMetadata } from "../../features/public-site/site";

export const metadata = publicMetadata("Pricing", "Explore proposed Fluxora workspace plans and learn how workflow runs are counted.", "/pricing");

export default function PricingPage() {
  return <PublicShell eyebrow="Pricing · early access" title="More flow, on your terms." description="Explore the proposed plans for a Fluxora workspace. There are no charges or enforced plan limits during early access.">
    <PlanCards />
    <p className="pricing-note">Prices and benefits are proposals, not yet available for purchase. Connected services and AI providers may charge separately.</p>
    <div className="pricing-questions">
      <PublicSection id="included" title="Built for work you can follow"><p>Build visually, test with mock data, inspect execution details, and connect supported apps using your own accounts. Fluxora can also be self-hosted; self-hosted infrastructure is separate from these proposed hosted plans.</p></PublicSection>
      <PublicSection id="runs" title="What is a workflow run?"><p>A live run starts a workflow using real data. One run can include multiple steps. Mock runs do not call connected services.</p><p>Usage shown today is based on retained execution history and may be incomplete. It is not used for billing.</p></PublicSection>
      <PublicSection id="access" title="What happens when I reach a limit?"><p>Limits are not enforced during early access. Before paid plans launch, we will explain how limits, renewal and cancellations work.</p></PublicSection>
    </div>
  </PublicShell>;
}
