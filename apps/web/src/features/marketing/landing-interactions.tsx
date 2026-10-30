"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useRef, useState } from "react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { LandingReveal, useLandingEffects } from "./landing-motion";
import { Disclosure } from "../../components/ui/disclosure";
import { useSurfaceMotion } from "../../components/ui/ui-motion";

const links = [
  { href: "#product", label: "Product" },
  { href: "#narrative", label: "How it works" },
  { href: "#usage", label: "Plan your runs" },
  { href: "#faq", label: "FAQ" },
];
const faqItems = [
  {
    question: "What can I automate with Fluxora?",
    answer:
      "Start with a recurring report, a GitHub event, or an update to a team channel. Connect triggers, conditions, app actions, and approvals in one visual workflow.",
  },
  {
    question: "Can I try a workflow before it goes live?",
    answer:
      "Yes. Use a mock run to inspect sample input and output without calling connected services. Publish a version and confirm when you are ready to make a live run.",
  },
  {
    question: "Where do my connection secrets live?",
    answer:
      "Connections are encrypted server-side. After saving, Fluxora shows connection details without returning the original secret. Credentials stay separate from your workflow configuration.",
  },
  {
    question: "Can I run Fluxora on my own infrastructure?",
    answer:
      "Yes. Fluxora is an open-source project built with Next.js, NestJS, PostgreSQL, and Redis, with Docker support for self-hosting. You manage your own provider accounts and infrastructure.",
  },
];

export function LandingNavigation() {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const { paused } = useLandingEffects();
  useSurfaceMotion(panel, open && !paused);
  return (
    <header className="landing-nav landing-container">
      <Link className="landing-brand" href="#top" aria-label="Fluxora home">
        <BrandLockup />
      </Link>
      <nav className="landing-nav__desktop" aria-label="Landing navigation">
        {links.map((link) => (
          <a href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="landing-nav__actions">
        <Link href="/login" className="landing-nav__sign-in">
          Sign in <ArrowRight size={14} />
        </Link>
        <details
          className="landing-nav__mobile"
          ref={menu}
          onToggle={(event) => setOpen(event.currentTarget.open)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && menu.current) {
              menu.current.open = false;
              trigger.current?.focus();
            }
          }}
        >
          <summary aria-label="Navigation menu" ref={trigger}>
            <Menu size={20} className="landing-menu-open" />
            <X size={20} className="landing-menu-close" />
          </summary>
          <nav ref={panel} aria-label="Mobile navigation">
            {links.map((link) => (
              <a
                href={link.href}
                key={link.href}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                {link.label}
                <ArrowRight size={14} />
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function LandingFaq() {
  const { paused } = useLandingEffects();
  return (
    <section
      className="landing-faq landing-container"
      id="faq"
      aria-labelledby="faq-heading"
    >
      <LandingReveal>
        <p className="landing-eyebrow">A FEW THINGS TO KNOW</p>
        <h2 id="faq-heading">
          Before you
          <br />
          <em>connect the dots.</em>
        </h2>
      </LandingReveal>
      <div className="landing-faq__items">
        {faqItems.map((item, index) => (
          <Disclosure
            className="landing-faq__item"
            key={item.question}
            defaultOpen={index === 0}
            paused={paused}
            summary={
              <>
                <span>{item.question}</span>
                <svg
                  className="landing-faq__toggle"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <path d="M3 9h12" />
                  <path className="landing-faq__vertical" d="M9 3v12" />
                </svg>
              </>
            }
          >
            <p>{item.answer}</p>
          </Disclosure>
        ))}
      </div>
    </section>
  );
}
