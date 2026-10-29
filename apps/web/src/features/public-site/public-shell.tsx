import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { publicLinks, publicSite } from "./site";
import "./public-site.css";

export function PublicShell({ eyebrow, title, description, children, sections = [] }: {
  eyebrow: string; title: string; description: string; children: ReactNode;
  sections?: readonly { id: string; title: string }[];
}) {
  return <div className="public-site" data-theme="dark">
    <a className="public-skip" href="#public-content">Skip to content</a>
    <header className="public-nav">
      <Link href="/" aria-label="Fluxora home"><BrandLockup /></Link>
      <nav aria-label="Public navigation"><Link href="/support">Support</Link><Link className="public-signin" href="/login">Sign in <ArrowUpRight size={16} /></Link></nav>
    </header>
    <main id="public-content" className="public-main">
      <div className="public-intro"><Link className="public-back" href="/"><ArrowLeft size={14} /> Back to Fluxora</Link>
        <p className="public-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="public-lead">{description}</p>
      </div>
      <div className={`public-body${sections.length ? " public-body--document" : ""}`}>
        {sections.length > 0 && <aside className="public-toc"><span>ON THIS PAGE</span><nav aria-label="On this page">{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav><p>Updated <time dateTime={publicSite.updated}>October 29, 2026</time></p></aside>}
        <div className="public-content">{children}</div>
      </div>
    </main>
    <footer className="public-footer"><span>© {new Date().getFullYear()} Fluxora</span><nav aria-label="Footer">{publicLinks.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}<a href={publicSite.repository}>GitHub <ArrowUpRight size={12} /></a></nav></footer>
  </div>;
}

export function PublicSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className="public-section" id={id}><h2>{title}</h2>{children}</section>;
}
