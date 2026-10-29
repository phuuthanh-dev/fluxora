import Link from "next/link";
import { ArrowUpRight, Bug, Mail, ShieldCheck } from "lucide-react";
import { PublicShell, PublicSection } from "../../features/public-site/public-shell";
import { publicMetadata, publicSite } from "../../features/public-site/site";
export const metadata = publicMetadata("Support", "Get help with Fluxora, report a bug, or request access to or deletion of your account data.", "/support");
export default function SupportPage() {
  return <PublicShell eyebrow="A human on the other end" title="Let’s get your workflow moving." description="Choose the right channel. A little context helps us understand what happened without exposing your data.">
    <div className="public-support-grid">
      <section className="public-support-card"><Mail size={26}/><h2>Account & private support</h2><p>Sign-in trouble, connection issues, privacy requests or account-data deletion. Contact the project maintainer directly.</p><a className="public-support-link" href={`mailto:${publicSite.email}`}>{publicSite.email}<ArrowUpRight size={16}/></a></section>
      <section className="public-support-card"><Bug size={26}/><h2>Report a product issue</h2><p>Found a reproducible bug or have an improvement to suggest? Use GitHub for reports that are safe to share publicly.</p><a className="public-support-link" href={`${publicSite.repository}/issues/new`}>Open a GitHub issue <ArrowUpRight size={16}/></a></section>
    </div>
    <div className="public-contact"><ShieldCheck size={18} aria-hidden="true"/> <strong>Keep secrets out of reports.</strong> Never include passwords, API tokens, webhook URLs, OAuth codes or unredacted workflow data. Send security concerns by email, not in a public issue.</div>
    <PublicSection id="report" title="What to include"><ol><li>The page or operation you were using, and what you expected.</li><li>The steps to reproduce it, your browser and whether it happened in Test or Live mode.</li><li>A redacted screenshot or the safe execution diagnostic export. Review attachments before sending.</li></ol></PublicSection>
    <PublicSection id="access" title="Manage your access"><p>Use Connections to manage workflow credentials. Use your account menu for linked sign-in methods. To stop Google access at the provider, visit <a href="https://myaccount.google.com/connections">Google Account connections</a>.</p><p>For account-wide data requests, email us from your account’s email address. We verify ownership before making changes. See the <Link href="/privacy">Privacy policy</Link> for retention and deletion boundaries. Community support has no guaranteed response time.</p></PublicSection>
  </PublicShell>;
}
