"use client";

import gsap from "gsap";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingReveal, useLandingEffects } from "./landing-motion";

const profiles = [
  {
    name: "Personal routines",
    runs: 3000,
    label: "START SMALL",
    copy: "A few useful workflows, running quietly in the background.",
    features: [
      "Daily reports and reminders",
      "Steam and connected apps",
      "Inspect each step before going live",
    ],
    cta: "Start with one workflow",
    href: "/login",
  },
  {
    name: "Daily operations",
    runs: 30000,
    label: "BUILD A RHYTHM",
    copy: "Bring recurring work and notifications into a clear, repeatable flow.",
    features: [
      "Schedules and webhook triggers",
      "Conditions and human approvals",
      "Execution history in one place",
    ],
    cta: "Explore Fluxora",
    href: "/login",
  },
  {
    name: "Higher volume",
    runs: 300000,
    label: "PLAN YOUR CAPACITY",
    copy: "Size your infrastructure around the work your workflows actually do.",
    features: [
      "Self-host on your infrastructure",
      "Separate API and worker processes",
      "Measure load and provider limits",
    ],
    cta: "Read the source",
    href: "https://github.com/phuuthanh-dev/workflow-automation",
  },
] as const;
const format = (value: number) => value.toLocaleString("en-US");

function RollingRuns({ value }: { value: number }) {
  const root = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const { paused } = useLandingEffects();
  const digits = String(value).padStart(6, " ");
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const before = String(previous.current).padStart(6, " ");
    previous.current = value;
    const media = gsap.matchMedia();
    if (!paused)
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          host
            .querySelectorAll<HTMLElement>(".landing-digits__strip")
            .forEach((strip, i) => {
              const digit = digits[i] === " " ? 10 : Number(digits[i]);
              const from = before[i] === " " ? 10 : Number(before[i]);
              gsap.fromTo(
                strip,
                { y: `${-from}em` },
                {
                  y: `${-digit}em`,
                  duration: 0.55,
                  delay: i * 0.035,
                  ease: "power3.out",
                },
              );
            });
        },
        host,
      );
    return () => media.revert();
  }, [digits, paused, value]);
  return (
    <span className="landing-digits" ref={root} aria-hidden="true">
      {[...digits].map((digit, i) => (
        <span
          className="landing-digits__column"
          key={i}
          style={{ width: digit === " " ? 0 : "0.65em" }}
        >
          <span
            className="landing-digits__strip"
            style={{
              transform: `translateY(-${digit === " " ? 10 : digit}em)`,
            }}
          >
            {Array.from({ length: 11 }, (_, n) => (
              <span key={n}>{n === 10 ? "\u00a0" : n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Relay pricing composition adapted to honest self-hosted capacity planning. */
export function LandingRunMeter() {
  const [position, setPosition] = useState(100);
  const [hovered, setHovered] = useState<number | null>(null);
  const runs = Math.round((3000 * 10 ** (position / 100)) / 100) * 100;
  const selected = runs <= 3000 ? 0 : runs <= 30000 ? 1 : 2;
  return (
    <section
      className="landing-run-planner landing-container"
      id="usage"
      aria-labelledby="usage-heading"
    >
      <LandingReveal className="landing-run-planner__head">
        <div>
          <p className="landing-eyebrow">04 — RUNS, ON YOUR TERMS</p>
          <h2 id="usage-heading">
            Your workflows.
            <br />
            <em>Your infrastructure.</em>
          </h2>
        </div>
        <p>
          Start with one useful automation. Plan around your workload as it
          grows. Hosting and connected-service costs stay separate.
        </p>
      </LandingReveal>
      <LandingReveal className="landing-run-planner__meter">
        <div className="landing-run-planner__control">
          <p className="landing-eyebrow" data-relay-type>PLAN THE REPETITION</p>
          <label htmlFor="landing-runs">
            How many runs do you expect a month?
          </label>
          <input
            id="landing-runs"
            type="range"
            min={0}
            max={200}
            step={1}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            aria-valuetext={`${format(runs)} runs per month, ${profiles[selected].name} planning profile`}
            style={{ "--run-fill": `${position / 2}%` } as CSSProperties}
          />
          <div className="landing-run-planner__stops" aria-hidden="true">
            <span data-relay-type>3,000</span>
            <span data-relay-type>30,000</span>
            <span data-relay-type>300,000</span>
          </div>
          <p className="landing-run-planner__note">
            A planning guide, not a capacity guarantee or a paid plan. Actual
            throughput depends on your server, workflow and provider limits.
          </p>
        </div>
        <div className="landing-run-planner__result">
          <p className="landing-eyebrow" data-relay-type>YOUR WORKLOAD</p>
          <h3>{profiles[selected].name}</h3>
          <RollingRuns value={runs} />
          <output htmlFor="landing-runs" className="sr-only">
            {format(runs)} runs a month
          </output>
          <span className="landing-run-planner__period">
            runs a month · about {format(Math.round(runs / 30))} a day
          </span>
          <Link
            className="landing-button landing-button--primary"
            href="/login"
          >
            Build your first workflow <ArrowRight size={16} />
          </Link>
        </div>
      </LandingReveal>
      <div className="landing-run-planner__cards">
        {profiles.map((profile, index) => (
          <LandingReveal
            as="article"
            className={`landing-run-card ${(hovered ?? selected) === index ? "is-lit" : ""}`}
            key={profile.name}
            delay={index * 0.07}
          >
            <div
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHovered(index);
              }}
              onPointerLeave={() => setHovered(null)}
            >
              <p className="landing-eyebrow" data-relay-type>{profile.label}</p>
              <h3>{profile.name}</h3>
              <p>{profile.copy}</p>
              <ul>
                {profile.features.map((feature) => (
                  <li key={feature}>
                    <Check size={16} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                className="landing-button landing-button--quiet"
                href={profile.href}
              >
                {profile.cta}
                <ArrowRight size={15} />
              </Link>
            </div>
          </LandingReveal>
        ))}
      </div>
    </section>
  );
}
