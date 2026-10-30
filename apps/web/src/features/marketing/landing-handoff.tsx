"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";
import { useLandingEffects } from "./landing-motion";
import { LandingReliability } from "./landing-sections";
import { relayFoldBox } from "./landing-fold";

gsap.registerPlugin(ScrollTrigger);

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** One visual object, from statement to runtime. Native HTML is the default. */
export function LandingHandoff() {
  const root = useRef<HTMLDivElement>(null);
  const { paused, introReady } = useLandingEffects();

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    if (!introReady) return;
    if (paused) {
      host.dataset.handoff = "static";
      return () => {
        delete host.dataset.handoff;
      };
    }
    const stage = host.querySelector<HTMLElement>(".landing-statement__stage");
    const plate = host.querySelector<HTMLElement>(".landing-statement__plate");
    const dock = host.querySelector<HTMLElement>(
      ".landing-runtime-hub__center",
    );
    if (!stage || !plate || !dock) return;
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      host.dataset.handoff = "active";
      let width = 0;
      let height = 0;
      let plateWidth = 0;
      let plateHeight = 0;
      let end = 0;
      let disposed = false;

      const measure = () => {
        width = host.clientWidth;
        height = stage.clientHeight;
        plateWidth = Math.min(1100, width < 640 ? width - 32 : width * 0.84);
        plateHeight = Math.max(350, Math.min(560, height * 0.6));
        plate.style.setProperty("--plate-width", `${plateWidth}px`);
        plate.style.setProperty("--plate-height", `${plateHeight}px`);
        const target = dock.getBoundingClientRect();
        end = target.top + window.scrollY + target.height / 2 - height * 0.64;
      };

      const paint = (progress: number) => {
        // Read geometry before writes. The destination can move with native
        // scroll, font loading or responsive layout; never hard-code its X/Y.
        const frame = stage.getBoundingClientRect();
        const target = dock.getBoundingClientRect();
        const grow = smooth((progress - 0.04) / 0.2);
        const fold = smooth((progress - 0.4) / 0.3);
        const travel = smooth((progress - 0.7) / 0.3);
        const size = target.width;
        // Relay's square-first fold keeps the content at its natural scale.
        // Only its clipping viewport changes; the logo survives the collapse.
        const box = relayFoldBox(
          grow * (1 - fold),
          plateWidth,
          plateHeight,
          size,
        );
        const w = box.width;
        const h = box.height;
        const x = mix(
          width / 2,
          target.left + target.width / 2 - frame.left,
          // Descend through the column gap before entering the diagram so
          // the badge does not travel across the reliability heading/copy.
          smooth((progress - 0.88) / 0.12),
        );
        const y = mix(
          height * 0.5 + 24,
          target.top + target.height / 2 - frame.top,
          travel,
        );
        const ink = smooth((progress - 0.87) / 0.13);
        // The lime shell briefly folds away around the dark badge in transit.
        const shell = 1 - smooth((progress - 0.7) / 0.12) + ink;
        const reveal = smooth((progress - 0.12) / 0.1);
        const copy = reveal * (1 - smooth((progress - 0.4) / 0.16));
        const contentScale = 1;
        plate.style.width = `${w}px`;
        plate.style.height = `${h}px`;
        plate.style.transform = `translate3d(${x - w / 2}px, ${y - h / 2}px, 0)`;
        plate.style.borderRadius = `${box.radius}px`;
        plate.style.setProperty("--plate-copy", String(copy));
        plate.style.setProperty("--copy-scale", String(contentScale));
        plate.style.setProperty("--plate-grid", String(reveal * (1 - fold)));
        plate.style.setProperty("--plate-shell", String(clamp(shell)));
        plate.style.setProperty(
          "--plate-fill",
          `${smooth((progress - 0.04) / 0.08) * 100}%`,
        );
        plate.style.setProperty(
          "--plate-outline",
          `${(1 - smooth((progress - 0.04) / 0.1)) * 100}%`,
        );
        plate.style.setProperty(
          "--badge-top",
          `${h / 2 + plateHeight * 0.17 * contentScale * grow * (1 - fold)}px`,
        );
        plate.style.setProperty("--badge-size", `${mix(68, size, ink)}px`);
        plate.style.setProperty("--badge-invert", `${ink * 100}%`);
        host.dataset.handoffPhase =
          progress < 0.4
            ? "expand"
            : progress < 0.7
              ? "collapse"
              : progress < 1
                ? "dock"
                : "docked";
        host.dataset.open = String(progress >= 0.24 && progress <= 0.4);
      };

      measure();
      const currentProgress = () => {
        const start = host.getBoundingClientRect().top + window.scrollY;
        const target = dock.getBoundingClientRect();
        const liveEnd =
          target.top + window.scrollY + target.height / 2 - height * 0.64;
        return clamp((window.scrollY - start) / (liveEnd - start));
      };
      const trigger = ScrollTrigger.create({
        trigger: host,
        start: "top top",
        end: () => end,
        onRefreshInit: measure,
        onRefresh: () => paint(currentProgress()),
        onUpdate: () => paint(currentProgress()),
      });
      // At progress=1 the badge continues moving with its destination in the
      // document. ScrollTrigger stops onUpdate at its endpoints, so use the
      // current document geometry. One coalesced follow-up frame lets sticky
      // mobile layout settle; it is not a second ticker.
      let settleFrame = 0;
      const onScroll = () => {
        paint(currentProgress());
        cancelAnimationFrame(settleFrame);
        settleFrame = requestAnimationFrame(() => {
          if (!disposed) paint(currentProgress());
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      // The destination itself can animate after scrolling stops. Follow it
      // on GSAP's existing ticker while this stage is in the docking range.
      const followDock = () => {
        const progress = currentProgress();
        if (progress >= 0.7 && stage.getBoundingClientRect().bottom > 0) paint(progress);
      };
      gsap.ticker.add(followDock);
      paint(trigger.progress);
      void document.fonts.ready.then(() => {
        if (!disposed) ScrollTrigger.refresh();
      });
      return () => {
        disposed = true;
        cancelAnimationFrame(settleFrame);
        gsap.ticker.remove(followDock);
        window.removeEventListener("scroll", onScroll);
        trigger.kill();
        delete host.dataset.handoff;
        delete host.dataset.handoffPhase;
        delete host.dataset.open;
        plate.removeAttribute("style");
      };
    });

    return () => media.revert();
  }, [paused, introReady]);

  return (
    <div className="landing-handoff" ref={root}>
      <section
        className="landing-statement"
        aria-labelledby="statement-heading"
      >
        <div className="landing-statement__track">
          <div className="landing-statement__stage">
            <div className="landing-statement__plate">
              <div className="landing-statement__shell" aria-hidden="true" />
              <div className="landing-statement__grid" aria-hidden="true" />
              <div className="landing-statement__copy">
                <p className="landing-eyebrow">A LITTLE LESS TO THINK ABOUT</p>
                <h2 id="statement-heading">
                  The best kind of busywork?
                  <br />
                  <em>The kind that runs itself.</em>
                </h2>
                <p className="landing-statement__caption">
                  Give the repetition a system. Give yourself some space.
                </p>
                <div className="landing-statement__ruler" aria-hidden="true">
                  {Array.from({ length: 41 }, (_, i) => (
                    <i key={i} />
                  ))}
                  <span>09:00</span>
                  <span>THE HAND-OFF</span>
                  <span>DONE</span>
                </div>
              </div>
              <span className="landing-statement__mark" aria-hidden="true">
                <FluxoraMark size={64} />
              </span>
            </div>
          </div>
        </div>
      </section>
      <LandingReliability />
    </div>
  );
}
