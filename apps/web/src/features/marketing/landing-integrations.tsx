"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { NodeIcon, type NodeIconName } from "../workflow/node-icon";
import { useLandingEffects } from "./landing-motion";

const apps: { name: string; icon: NodeIconName }[] = [
  { name: "GitHub", icon: "github" },
  { name: "Google Drive", icon: "google-drive" },
  { name: "Google Sheets", icon: "google-sheets" },
  { name: "Discord", icon: "discord" },
  { name: "Telegram", icon: "telegram" },
  { name: "Steam", icon: "steam" },
];

/**
 * A compact, truthful app inventory. Motion only stages existing content: the
 * rail resolves first, then supported integrations arrive as one mechanism.
 */
export function LandingIntegrations() {
  const root = useRef<HTMLElement>(null);
  const { introReady, paused } = useLandingEffects();

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || paused || !introReady) return;

    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const rail = element.querySelector<HTMLElement>(
        ".landing-integrations__rail",
      );
      const items = element.querySelectorAll<HTMLElement>(
        "[data-integration]",
      );
      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: { trigger: element, start: "top 88%", once: true },
      });
      timeline
        .fromTo(
          rail,
          { scaleX: 0, autoAlpha: 0.28 },
          { scaleX: 1, autoAlpha: 1, duration: 0.72 },
        )
        .fromTo(
          items,
          { y: 16, scale: 0.94, autoAlpha: 0 },
          {
            y: 0,
            scale: 1,
            autoAlpha: 1,
            duration: 0.48,
            stagger: 0.07,
          },
          0.12,
        );
      const packet = element.querySelector<HTMLElement>(".landing-integrations__packet");
      const travel = gsap.fromTo(packet, { x: 0, autoAlpha: 0 }, {
        x: () => Math.max(0, (rail?.clientWidth ?? 0) - 8),
        autoAlpha: 1, duration: 5, ease: "none", repeat: -1,
        repeatDelay: 0.6, paused: true, invalidateOnRefresh: true,
      });
      const visibility = ScrollTrigger.create({
        trigger: element,
        start: "top bottom",
        end: "bottom top",
        onEnter: () => travel.play(),
        onEnterBack: () => travel.play(),
        onLeave: () => travel.pause(),
        onLeaveBack: () => travel.pause(),
        onRefresh: (self) => self.isActive ? travel.play() : travel.pause(),
      });
      return () => { visibility.kill(); travel.kill(); timeline.kill(); };
    }, element);
    return () => media.revert();
  }, [introReady, paused]);

  return (
    <section
      ref={root}
      className="landing-integrations landing-container"
      id="integrations"
      aria-label="Available integrations"
    >
      <p>
        Familiar tools.
        <br />
        <strong>New possibilities.</strong>
      </p>
      <div className="landing-integrations__apps">
        <i className="landing-integrations__rail" aria-hidden="true"><span className="landing-integrations__packet" /></i>
        {apps.map((app) => (
          <span className="landing-integration" data-integration key={app.name}>
            <NodeIcon name={app.icon} size={24} />
            <span>{app.name}</span>
          </span>
        ))}
      </div>
      <span className="landing-integrations__more">+ HTTP &amp; more</span>
    </section>
  );
}
