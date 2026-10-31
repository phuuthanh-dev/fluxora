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
          { scaleX: 1, autoAlpha: 1, duration: 1.76, ease: "power1.inOut" },
        )
        .fromTo(
          items,
          { y: 16, scale: 0.8, autoAlpha: 0 },
          {
            y: 0,
            scale: 1,
            autoAlpha: 1,
            duration: 0.48,
            stagger: 1.76 / Math.max(1, items.length),
          },
          0.08,
        );
      const packet = element.querySelector<HTMLElement>(".landing-integrations__packet");
      let activeIndex = -1;
      const setActive = (index: number) => {
        if (index === activeIndex) return;
        items.forEach((item, position) => {
          if (position === index) item.dataset.signal = "active";
          else delete item.dataset.signal;
        });
        activeIndex = index;
      };
      // Cache layout only on refresh. The active tile is selected by the
      // packet's actual position, rather than an even division of the rail.
      let centers: number[] = [];
      let railWidth = 0;
      const measure = () => {
        railWidth = rail?.clientWidth ?? 0;
        const origin = rail?.offsetLeft ?? 0;
        centers = Array.from(items, (item) => item.offsetLeft + item.offsetWidth / 2 - origin - 3.5);
      };
      measure();
      const position = { x: 0 };
      const setPacketX = packet ? gsap.quickSetter(packet, "x", "px") : () => {};
      const travel = gsap.timeline({ repeat: -1, paused: true });
      travel.fromTo(position, { x: () => centers[0] ?? 0 }, {
        x: () => centers.at(-1) ?? 0,
        duration: 5.6,
        ease: (t: number) => t < 0.18 ? t * t / (0.36 * 0.91) : (t - 0.09) / 0.91,
        onUpdate: () => {
          setPacketX(position.x);
          if (rail && railWidth > 0) {
            const peak = Math.max(0, Math.min(100, (position.x + 3.5) / railWidth * 100));
            rail.style.setProperty("--rail-head", `${peak}%`);
          }
          let nearest = -1;
          let distance = Infinity;
          centers.forEach((center, index) => {
            const current = Math.abs(center - position.x);
            if (current < distance) { distance = current; nearest = index; }
          });
          setActive(nearest);
        },
      }, 0.03).fromTo(packet, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.36, ease: "none" }, 0.03)
        .to(packet, { autoAlpha: 0, duration: 0.36, ease: "none" }, 5.83)
        .to({}, { duration: 0.02 });
      let inView = false;
      let started = false;
      const show = () => {
        inView = true;
        // The mobile layout wraps tiles into a grid and hides the horizontal
        // rail. Do not light unrelated tiles with an invisible packet.
        if (!rail || getComputedStyle(rail).display === "none") {
          travel.pause();
          setActive(-1);
          return;
        }
        if (!document.hidden) {
          if (!started) { started = true; travel.restart(); }
          else travel.resume();
        }
      };
      const hide = () => { inView = false; travel.pause(); setActive(-1); };
      const syncVisibility = () => {
        if (!inView || document.hidden) travel.pause();
        else if (rail && getComputedStyle(rail).display !== "none") {
          if (!started) show();
          else travel.resume();
        }
      };
      document.addEventListener("visibilitychange", syncVisibility);
      const visibility = ScrollTrigger.create({
        trigger: element,
        start: "top 88%",
        end: "bottom top",
        onEnter: show,
        onEnterBack: show,
        onLeave: hide,
        onLeaveBack: hide,
        onRefresh: (self) => {
          const width = rail?.clientWidth ?? 0;
          if (width !== railWidth) {
            const elapsed = travel.totalTime();
            measure();
            travel.invalidate().totalTime(elapsed, true);
          }
          if (self.isActive) show();
          else if (inView) hide();
        },
      });
      return () => { document.removeEventListener("visibilitychange", syncVisibility); visibility.kill(); travel.kill(); timeline.kill(); rail?.style.removeProperty("--rail-head"); setActive(-1); };
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
