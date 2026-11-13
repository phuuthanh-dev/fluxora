"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LayoutDashboard, Menu, Settings, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { LandingReveal, useLandingEffects } from "./landing-motion";
import { Disclosure } from "../../components/ui/disclosure";
import { Menu as AccountMenu } from "../../components/ui/menu";
import { useSurfaceMotion } from "../../components/ui/ui-motion";
import { apiRequest } from "../api/api-client";

const links = [
  { href: "#product", label: "Product" },
  { href: "#narrative", label: "How it works" },
  { href: "#usage", label: "Plan your runs" },
  { href: "/pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];
function accountInitials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}` : source.slice(0, 2)).toLocaleUpperCase();
}
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

export function LandingNavigation({ publicPage = false }: { publicPage?: boolean }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [session, setSession] = useState<{ email: string; displayName: string | null; avatarColor: string } | null | undefined>(undefined);
  const { paused } = useLandingEffects();
  useSurfaceMotion(panel, open && !paused);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ user: { email: string; displayName: string | null; avatarColor: string } }>("/auth/me", { signal: controller.signal, cache: "no-store" }, { silentUnauthorized: true })
      .then(({ user }) => { if (!controller.signal.aborted) setSession(user?.email ? user : null); })
      .catch(() => { if (!controller.signal.aborted) setSession(null); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 56);
      if (!publicPage) {
        const marker = 130;
        const current = ["product", "narrative", "usage", "faq"].filter((id) => {
          const rect = document.getElementById(id)?.getBoundingClientRect();
          return rect && rect.top <= marker && rect.bottom > marker;
        }).at(-1);
        setActiveSection(current ? `#${current}` : "");
      }
    };
    const requestUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [publicPage]);
  const currentLink = (href: string) => href === "/pricing" && pathname === "/pricing" ? "page" : !publicPage && activeSection === href ? "location" : undefined;
  return (
    <header
      className="landing-nav landing-container"
      data-scrolled={scrolled}
    >
      <Link className="landing-brand" href={publicPage ? "/" : "#top"} aria-label="Fluxora home">
        <BrandLockup />
      </Link>
      <nav className="landing-nav__desktop" aria-label="Landing navigation">
        {links.map((link) => (
          <a href={publicPage && link.href.startsWith("#") ? `/${link.href}` : link.href} key={link.href} aria-current={currentLink(link.href)}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="landing-nav__actions">
        {session === undefined ? <span className="landing-account-placeholder" aria-hidden="true" /> : session ? <AccountMenu label="Account" className="landing-account" trigger={<span className={`landing-account__avatar landing-account__avatar--${["lime", "violet", "sky", "coral"].includes(session.avatarColor) ? session.avatarColor : "lime"}`} aria-hidden="true">{accountInitials(session.displayName, session.email)}</span>}>
          <div className="landing-account__identity"><strong>{session.displayName || "Your account"}</strong><span>{session.email}</span></div>
          <Link href="/dashboard" role="menuitem"><LayoutDashboard size={16} /> Dashboard</Link>
          <Link href="/settings/account" role="menuitem"><Settings size={16} /> Account settings</Link>
        </AccountMenu> : <Link href="/login" className="landing-nav__sign-in">Sign in <ArrowRight size={14} /></Link>}
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
                href={publicPage && link.href.startsWith("#") ? `/${link.href}` : link.href}
                key={link.href}
                aria-current={currentLink(link.href)}
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
