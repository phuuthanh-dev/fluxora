import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LandingNavigation } from "../marketing/landing-interactions";
import { LandingFooter } from "../marketing/landing-footer";
import { PublicMotion } from "./public-motion";
import { publicSite } from "./site";
import "../marketing/landing.css";
import "../marketing/landing-template.css";
import "./public-site.css";

export function PublicShell({ eyebrow, title, description, children, sections = [], updated = publicSite.updated }: {
  eyebrow: string; title: string; description: string; children: ReactNode;
  sections?: readonly { id: string; title: string }[]; updated?: string;
}) {
  return <div className="public-site landing-page" id="top" data-theme="dark">
    <a className="public-skip" href="#public-content">Skip to content</a>
    <LandingNavigation publicPage />
    <PublicMotion>
    <main id="public-content" className="public-main">
      <div className="public-intro"><Link className="public-back" href="/"><ArrowLeft size={14} /> Back to Fluxora</Link>
        <p className="public-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="public-lead">{description}</p>
      </div>
      <div className={`public-body${sections.length ? " public-body--document" : ""}`}>
        {sections.length > 0 && <aside className="public-toc"><span>ON THIS PAGE</span><nav aria-label="On this page">{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav><p>Updated <time dateTime={updated}>{new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${updated}T00:00:00Z`))}</time></p></aside>}
        <div className="public-content">{children}</div>
      </div>
    </main>
    <LandingFooter publicPage />
    </PublicMotion>
  </div>;
}

export function PublicSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className="public-section" id={id}><h2>{title}</h2>{children}</section>;
}
