"use client";

import Link from "next/link";
import { ArrowRight, Menu, Plus, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { LandingReveal } from "./landing-motion";

const links = [
  { href: "#product", label: "Product" },
  { href: "#narrative", label: "How it works" },
  { href: "#usage", label: "Your time back" },
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
          <nav aria-label="Mobile navigation">
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

export function LandingUsageMeter() {
  const [tasks, setTasks] = useState(5);
  // A transparent planning calculation, not measured customer savings or pricing.
  const hours = (tasks * 5 * 20) / 60;
  const percentage = ((tasks - 1) / 19) * 100;
  return (
    <section
      className="landing-usage landing-container"
      id="usage"
      aria-labelledby="usage-heading"
    >
      <LandingReveal className="landing-usage__intro">
        <p className="landing-eyebrow">04 — SMALL TASKS. REAL TIME.</p>
        <h2 id="usage-heading">
          What would you do
          <br />
          with <em>that time back?</em>
        </h2>
        <p>
          The five-minute tasks add up. Move a few off your list and make room
          for the work you care about.
        </p>
      </LandingReveal>
      <LandingReveal className="landing-usage__panel">
        <div className="landing-usage__readout">
          <span>TIME SPENT ON REPEAT TASKS</span>
          <div>
            <output htmlFor="landing-tasks">{hours.toFixed(1)}</output>
            <span>
              hours
              <br />a month
            </span>
          </div>
        </div>
        <div className="landing-usage__bars" aria-hidden="true">
          {Array.from({ length: 40 }, (_, index) => (
            <i className={index < tasks * 2 ? "is-filled" : ""} key={index} />
          ))}
        </div>
        <label htmlFor="landing-tasks">
          Recurring tasks per workday <output>{tasks}</output>
        </label>
        <input
          id="landing-tasks"
          type="range"
          min="1"
          max="20"
          step="1"
          value={tasks}
          onChange={(event) => setTasks(Number(event.target.value))}
          style={{ "--meter-fill": `${percentage}%` } as CSSProperties}
          aria-valuetext={`${tasks} tasks per workday, ${hours.toFixed(1)} hours per month`}
        />
        <div className="landing-usage__scale">
          <span>1 task</span>
          <span>20 tasks</span>
        </div>
        <p className="landing-usage__assumption">
          Planning estimate: 5 minutes per task × 20 workdays.
          <br />
          Actual time saved depends on your workflow.
        </p>
      </LandingReveal>
    </section>
  );
}

export function LandingFaq() {
  return (
    <section
      className="landing-faq landing-container"
      id="faq"
      aria-labelledby="faq-heading"
    >
      <div>
        <p className="landing-eyebrow">A FEW THINGS TO KNOW</p>
        <h2 id="faq-heading">
          Before you
          <br />
          <em>connect the dots.</em>
        </h2>
      </div>
      <div className="landing-faq__items">
        {faqItems.map((item, index) => (
          <details
            className="landing-faq__item"
            key={item.question}
            name="landing-faq"
            open={index === 0}
          >
            <summary>
              <span>{item.question}</span>
              <Plus size={18} />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
