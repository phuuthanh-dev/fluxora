import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";
import { publicLinks } from "../public-site/site";
import { LandingReveal } from "./landing-motion";

export function LandingFooter() {
  return (
    <LandingReveal
      as="footer"
      className="landing-footer landing-container landing-footer--relay"
      ariaLabel="Fluxora footer"
    >
      <div className="landing-footer__panels">
        <div className="landing-footer__brand-panel">
          <span className="landing-footer__watermark" aria-hidden="true">
            <FluxoraMark size={250} />
          </span>
          <Link className="landing-brand" href="#top">
            <FluxoraMark size={28} />
            <strong>Fluxora</strong>
          </Link>
          <p>
            A clearer way to keep work moving.
            <br />
            Built for the work between your apps.
          </p>
          <span className="landing-eyebrow">YOUR WORKFLOWS. YOUR CONTROL.</span>
        </div>
        <div className="landing-footer__cta-panel">
          <p className="landing-eyebrow">YOUR NEXT GOOD HABIT</p>
          <h2>
            Let the work <em>flow.</em>
          </h2>
          <p>
            Bring one task you would rather not do twice. Connect your apps,
            inspect a sample run, then go live when you are ready.
          </p>
          <Link className="landing-button" href="/login">
            Build something useful <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <div className="landing-footer__principles">
        <span>Visual workflows</span>
        <span>Inspectable runs</span>
        <span>Self-hosted infrastructure</span>
      </div>
      <nav aria-label="Footer">
        <a href="#product">Product</a>
        <a href="#faq">FAQ</a>
        {publicLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        <a href="https://github.com/phuuthanh-dev/workflow-automation">
          GitHub
        </a>
        <Link href="/login">
          Sign in <ArrowRight size={13} />
        </Link>
      </nav>
      <div className="landing-footer__bottom">
        <span>© {new Date().getFullYear()} Fluxora</span>
        <span>MADE FOR THE WORK IN BETWEEN.</span>
        <a href="#top">Back to top ↑</a>
      </div>
    </LandingReveal>
  );
}
