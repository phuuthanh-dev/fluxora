"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LandingIntro } from "./landing-intro";

const LandingEffectsContext = createContext({
  paused: false,
  introReady: false,
  introRevealing: false,
  togglePaused: () => {},
});

/** Unit-mass spring matching Relay's documented tension and friction. */
function relaySpring(tension: number, friction: number, seconds: number) {
  const halfDamping = friction / 2;
  const discriminant = tension - halfDamping * halfDamping;
  const position = (time: number) => {
    if (discriminant > 0) {
      const frequency = Math.sqrt(discriminant);
      return 1 - Math.exp(-halfDamping * time) *
        (Math.cos(frequency * time) + halfDamping / frequency * Math.sin(frequency * time));
    }
    if (Math.abs(discriminant) < 0.00001)
      return 1 - Math.exp(-halfDamping * time) * (1 + halfDamping * time);
    const root = Math.sqrt(-discriminant);
    const r1 = -halfDamping + root, r2 = -halfDamping - root;
    return 1 + (r2 * Math.exp(r1 * time) - r1 * Math.exp(r2 * time)) / (r1 - r2);
  };
  const end = position(seconds);
  return (progress: number) => position(progress * seconds) / end;
}

// Play once, hold the resolved frame, then rewind slowly enough to remain legible.
// Relay specifies 800ms for product cards; Fluxora deliberately uses a longer
// rewind because the spring-based child tweens settle for much of the timeline.
// A separate playhead avoids yoyo/repeatDelay holding the empty reset frame.
function relayLoop(animation: gsap.core.Timeline, playSeconds: number, prepare: () => void, chartBars?: NodeListOf<HTMLElement>) {
  const state = { progress: 0 };
  // Preserve the absolute offsets of individual beats even when the last
  // visible tween finishes before Relay's specified play duration.
  animation.to({}, { duration: 0.001 }, playSeconds - 0.001);
  // Never squeeze a longer child sequence into the nominal play window: doing
  // so silently moves all of its cues earlier and can cut short the ending.
  const resolvedPlaySeconds = Math.max(playSeconds, animation.duration());
  const paint = () => {
    animation.progress(state.progress);
    if (state.progress <= 0.0001) prepare();
  };
  const loop = gsap.timeline({ paused: true, repeat: -1 })
    .fromTo(state, { progress: 0 }, { progress: 1, duration: resolvedPlaySeconds, ease: "none", onUpdate: paint, immediateRender: false })
    .to(state, { progress: 1, duration: 2.8, ease: "none" });
  if (chartBars?.length) {
    // A settled spring barely changes until its final frames when reversed.
    // Collapse the outer bars independently, then reset the hidden inner art.
    loop.to(chartBars, { scaleY: 0, opacity: 0, transformOrigin: "50% 100%", duration: 2.4, stagger: { each: 0.12, from: "end" }, ease: "sine.inOut" })
      .call(() => {
        state.progress = 0;
        animation.progress(0);
        prepare();
        gsap.set(chartBars, { clearProps: "opacity,transform,transformOrigin" });
      });
  } else {
    loop.to(state, { progress: 0, duration: 6.4, ease: "sine.inOut", onUpdate: paint });
  }
  return loop;
}

export function useLandingEffects() {
  return useContext(LandingEffectsContext);
}

export function LandingMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const [introRevealing, setIntroRevealing] = useState(false);
  const revealIntro = useCallback(() => setIntroRevealing(true), []);
  const releaseIntro = useCallback(() => { setIntroRevealing(true); setIntroReady(true); }, []);
  return (
    <LandingEffectsContext.Provider
      value={{
        paused,
        introReady,
        introRevealing,
        togglePaused: () => setPaused((value) => !value),
      }}
    >
      {!introReady ? <LandingIntro onReveal={revealIntro} onComplete={releaseIntro} /> : null}
      <LandingCursor />
      {children}
    </LandingEffectsContext.Provider>
  );
}

/**
 * Decorative only: Relay keeps the native cursor and adds a soft follower for
 * fine pointers. Keeping it here gives the landing one lifecycle owner and
 * guarantees it disappears for pause/reduced-motion paths.
 */
function LandingCursor() {
  const ring = useRef<HTMLSpanElement>(null);
  const { paused, introReady } = useLandingEffects();

  useLayoutEffect(() => {
    const element = ring.current;
    if (!element || paused || !introReady) return;
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
      () => {
        const x = gsap.quickTo(element, "x", {
          duration: 0.32,
          ease: "power3.out",
        });
        const y = gsap.quickTo(element, "y", {
          duration: 0.32,
          ease: "power3.out",
        });
        const scaleX = gsap.quickTo(element, "scaleX", {
          duration: 0.2,
          ease: "power2.out",
        });
        const scaleY = gsap.quickTo(element, "scaleY", {
          duration: 0.2,
          ease: "power2.out",
        });
        const scale = (value: number) => { scaleX(value); scaleY(value); };
        const alpha = gsap.quickTo(element, "opacity", {
          duration: 0.16,
          ease: "power2.out",
        });
        const interactive = (target: EventTarget | null) =>
          target instanceof Element &&
          Boolean(
            target.closest(
              "a, button, input, textarea, select, summary, [role=button], [role=tab], [role=slider]",
            ),
          );
        const move = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          x(event.clientX);
          y(event.clientY);
          alpha(1);
          const isInteractive = interactive(event.target);
          element.dataset.interactive = String(isInteractive);
          scale(isInteractive ? 1.55 : 1);
        };
        const hide = () => {
          alpha(0);
          element.dataset.interactive = "false";
        };
        const press = () => scale(0.82);
        const release = () =>
          scale(element.dataset.interactive === "true" ? 1.55 : 1);
        gsap.set(element, { x: -200, y: -200, opacity: 0, scaleX: 1, scaleY: 1 });
        window.addEventListener("pointermove", move, { passive: true });
        const leaveDocument = (event: MouseEvent) => {
          if (!event.relatedTarget) hide();
        };
        document.addEventListener("mouseout", leaveDocument);
        window.addEventListener("blur", hide);
        window.addEventListener("pointerdown", press, { passive: true });
        window.addEventListener("pointerup", release, { passive: true });
        return () => {
          window.removeEventListener("pointermove", move);
          document.removeEventListener("mouseout", leaveDocument);
          window.removeEventListener("blur", hide);
          window.removeEventListener("pointerdown", press);
          window.removeEventListener("pointerup", release);
        };
      },
      element,
    );
    return () => media.revert();
  }, [paused, introReady]);

  return (
    <span
      ref={ring}
      className="landing-cursor"
      aria-hidden="true"
      data-interactive="false"
    >
      <i />
    </span>
  );
}

export function LandingReveal({
  as = "div",
  children,
  className,
  delay = 0,
  ariaLabel,
}: {
  as?: "article" | "div" | "footer";
  children: ReactNode;
  className?: string;
  delay?: number;
  ariaLabel?: string;
}) {
  const root = useRef<HTMLElement | null>(null);
  const { paused, introReady } = useLandingEffects();
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || paused || !introReady) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        const cleanups: Array<() => void> = [];
        const targets = element.matches(".landing-footer")
          ? Array.from(element.children)
          : element;
        // Relay keeps the plan-card glass in place and stages its content.
        // Animating the whole card also blurs the background and makes the
        // frosted slab visibly jump when it crosses the viewport.
        if (element.classList.contains("landing-run-card")) {
          const content = element.querySelectorAll(":scope > div > p, :scope > div > h3, :scope > div > ul > li, :scope > div > a");
          gsap.fromTo(content, { y: 10, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.5, delay, stagger: 0.07,
            ease: "power2.out", immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 90%", once: true },
          });
          const checks = element.querySelectorAll(":scope > div > ul > li > svg");
          const strokes = element.querySelectorAll(":scope > div > ul > li > svg path");
          const featureCopy = element.querySelectorAll(":scope > div > ul > li > span");
          const featureTimeline = gsap.timeline({
            delay: delay + 0.14,
            scrollTrigger: { trigger: element, start: "top 90%", once: true },
          });
          featureTimeline.fromTo(checks, { opacity: 0, scale: 0.5 }, {
            opacity: 1, scale: 1, duration: 0.35, stagger: 0.04,
            ease: relaySpring(420, 39, 0.35), immediateRender: false, clearProps: "opacity,transform",
          }, 0.04).fromTo(strokes, { strokeDasharray: "1", strokeDashoffset: 1, attr: { pathLength: 1 } }, {
            strokeDashoffset: 0, duration: 0.4, stagger: 0.04,
            ease: relaySpring(180, 31.72, 0.4), immediateRender: false, clearProps: "strokeDasharray,strokeDashoffset",
          }, 0.088).fromTo(featureCopy, { opacity: 0, filter: "blur(8px)" }, {
            opacity: 1, filter: "blur(0px)", duration: 0.55, stagger: 0.04,
            ease: relaySpring(280, 32, 0.55), immediateRender: false, clearProps: "opacity,filter",
          }, 0.08);
        } else {
          gsap.fromTo(
            targets,
            { y: 24, opacity: 0.3, filter: "blur(8px)" },
            {
              y: 0, opacity: 1, filter: "blur(0px)", duration: 0.75,
              delay, stagger: 0.07, ease: "power2.out", immediateRender: false,
              scrollTrigger: { trigger: element, start: "top 94%", once: true },
            },
          );
        }
        // Give each heading and its supporting copy its own focus-in, as in
        // Relay, while retaining the enclosing section's softer rise.
        const text = element.classList.contains("landing-run-card")
          ? []
          : element.querySelectorAll(
              ":scope > h2, :scope > div > h2, :scope > div > h3, :scope > p:not(.landing-eyebrow), :scope > div > p:not(.landing-eyebrow)",
            );
        if (text.length) {
          const focusMask = "linear-gradient(90deg, black calc(var(--focus-progress) - 40%), transparent var(--focus-progress))";
          gsap.fromTo(text,
            { opacity: 0, filter: "blur(8px)", "--focus-progress": "0%", maskImage: focusMask },
            { opacity: 1, filter: "blur(0px)", "--focus-progress": "140%", maskImage: focusMask,
              clearProps: "maskImage,--focus-progress", duration: 0.9,
              stagger: 0.14, delay: delay + 0.07, ease: "power2.out", immediateRender: false,
              scrollTrigger: { trigger: element, start: "top 90%", once: true } },
          );
        }
        const typeLabels = element.querySelectorAll<HTMLElement>("[data-relay-type]");
        typeLabels.forEach((label, index) => {
          const length = Math.max(1, (label.textContent ?? "").trim().length);
          gsap.fromTo(label, { clipPath: "inset(0 100% 0 0)" }, {
            clipPath: "inset(0 0% 0 0)", duration: length * (Number(label.dataset.relayCharMs) || 30) / 1000,
            delay: delay + index * 0.07, ease: `steps(${length})`,
            immediateRender: false, clearProps: "clipPath",
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          });
        });
        if (element.classList.contains("landing-footer")) {
          const panels = element.querySelector(".landing-footer__panels");
          const title = element.querySelector(".landing-footer__cta-panel h2");
          const ctaCopy = element.querySelector(".landing-footer__cta-panel > p:not(.landing-eyebrow)");
          const brandCopy = element.querySelector(".landing-footer__brand-panel > p");
          const cta = element.querySelector(".landing-footer__cta-panel .landing-button");
          const footerStage = gsap.timeline({ scrollTrigger: { trigger: panels ?? element, start: "top 95%", once: true } });
          if (title) footerStage.fromTo(title, { y: 20, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.65, ease: relaySpring(280, 32, 0.65),
            immediateRender: false, clearProps: "opacity,transform",
          }, 0.16);
          if (ctaCopy) footerStage.fromTo(ctaCopy, { opacity: 0, filter: "blur(8px)" }, {
            opacity: 1, filter: "blur(0px)", duration: 0.8, ease: relaySpring(120, 26, 0.8),
            immediateRender: false, clearProps: "opacity,filter",
          }, 0.26);
          if (cta) footerStage.fromTo(cta, { y: 16, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.65, ease: relaySpring(280, 32, 0.65),
            immediateRender: false, clearProps: "opacity,transform",
          }, 0.35);
          if (brandCopy) footerStage.fromTo(brandCopy, { opacity: 0, filter: "blur(8px)" }, {
            opacity: 1, filter: "blur(0px)", duration: 0.8, ease: relaySpring(120, 26, 0.8),
            immediateRender: false, clearProps: "opacity,filter",
          }, 0.43);
          const links = element.querySelectorAll("nav a");
          if (links.length) gsap.fromTo(links, { y: 12, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.6, stagger: 0.05,
            ease: relaySpring(280, 32, 0.6), immediateRender: false, clearProps: "opacity,transform",
            scrollTrigger: { trigger: element.querySelector("nav") ?? element, start: "top 95%", once: true },
          });
        }
        if (element.classList.contains("landing-daily__grid")) {
          const cells = element.querySelectorAll(".landing-heatmap td > span");
          const widgets = element.querySelectorAll(":scope > div");
          gsap.fromTo(widgets, { opacity: 0, y: 24 }, {
            opacity: 1, y: 0, duration: 0.65, stagger: 0.07, delay: 0.14,
            ease: relaySpring(280, 32, 0.65), immediateRender: false, clearProps: "opacity,transform",
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          });
          const animation = gsap.timeline({ paused: true });
          animation.fromTo(cells, { opacity: 0, scale: 0.92 }, {
            opacity: 1, scale: 1, duration: 0.55,
            stagger: (index: number) => (Math.floor(index / 5) + index % 5) * 0.036,
            ease: "power2.out", immediateRender: false,
          }, 0.2);
          const ring = element.querySelector(".landing-daily__gauge circle:last-child");
          if (ring) animation.fromTo(ring, { strokeDashoffset: 100 }, {
            strokeDashoffset: 0, duration: 1.44, ease: relaySpring(180, 31.72, 1.44), immediateRender: false,
          }, 0.41);
          const gaugeValue = element.querySelector<HTMLElement>(".landing-daily__gauge-value");
          const gaugeProgress = { value: 0 };
          if (gaugeValue) animation.fromTo(gaugeProgress, { value: 0 }, {
            value: 1, duration: 1.44, ease: relaySpring(180, 31.72, 1.44), immediateRender: false,
            onUpdate: () => { gaugeValue.textContent = String(Math.round(gaugeProgress.value * Number(gaugeValue.dataset.value))); },
          }, 0.41);
          const feed = element.querySelectorAll(".landing-daily__feed > div");
          if (feed.length) animation.fromTo(feed, { opacity: 0, y: 8 }, {
            opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: "power2.out", immediateRender: false,
          }, 0.45);
          const recovery = element.querySelector(".landing-daily__recovery path");
          if (recovery) animation.fromTo(recovery, { strokeDashoffset: 100 }, {
            strokeDashoffset: 0, duration: 1, ease: "power2.out", immediateRender: false,
          }, 0.7);
          const prepare = () => {
            gsap.set(cells, { opacity: 0, scale: 0.92 });
            if (ring) gsap.set(ring, { strokeDashoffset: 100 });
            if (gaugeValue) gaugeValue.textContent = "0";
            if (feed.length) gsap.set(feed, { opacity: 0, y: 8 });
            if (recovery) gsap.set(recovery, { strokeDashoffset: 100 });
          };
          const loop = relayLoop(animation, 2.24, prepare);
          let inView = false;
          let started = false;
          const show = () => {
            inView = true;
            if (document.hidden) return;
            if (!started) { prepare(); started = true; loop.restart(); }
            else loop.resume();
          };
          const hide = () => { inView = false; loop.pause(); };
          const syncVisibility = () => { if (!inView || document.hidden) loop.pause(); else if (!started) show(); else loop.resume(); };
          document.addEventListener("visibilitychange", syncVisibility);
          const visibility = ScrollTrigger.create({ trigger: element, start: "top 88%", end: "bottom top", onEnter: show, onEnterBack: show, onLeave: hide, onLeaveBack: hide, onRefresh: (self) => { if (self.isActive && !inView) show(); else if (!self.isActive && inView) hide(); } });
          cleanups.push(() => {
            document.removeEventListener("visibilitychange", syncVisibility);
            visibility.kill(); loop.kill(); animation.kill();
            gsap.set([...cells, ...feed], { clearProps: "opacity,transform" });
            if (ring) gsap.set(ring, { clearProps: "strokeDashoffset" });
            if (gaugeValue) gaugeValue.textContent = gaugeValue.dataset.value ?? "0";
            if (recovery) gsap.set(recovery, { clearProps: "strokeDashoffset" });
          });
        }
        if (element.classList.contains("landing-chapter")) {
          const rule = element.querySelector(".landing-chapter__rule");
          if (rule) gsap.fromTo(rule, { scaleX: 0 }, {
            scaleX: 1, duration: 0.8, ease: "power2.out", immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 90%", once: true },
          });
          const visual = element.querySelector<HTMLElement>(".landing-chapter__visual");
          if (visual) {
            // Each illustration owns one bounded loop and is inactive outside
            // the viewport. The static, readable DOM remains the default.
            const animation = gsap.timeline({ paused: true });
            const bars = visual.querySelectorAll(".landing-chapter__trace-row b");
            const approval = visual.querySelectorAll(".landing-chapter__approval > :not(.landing-chapter__typing)");
            const typing = visual.querySelector<HTMLElement>(".landing-chapter__typing");
            const cubes = visual.querySelectorAll(".landing-volume__cube");
            const caps = visual.querySelectorAll(".landing-volume__cap");
            const glow = visual.querySelector(".landing-volume__glow");
            if (bars.length) {
              const starts = [0.36, 0.76, 0.92, 1.04];
              const title = visual.querySelector<HTMLElement>(".landing-chapter__trace-title");
              if (title) animation.fromTo(title, { clipPath: "inset(0 100% 0 0)" }, {
                clipPath: "inset(0 0% 0 0)", duration: (title.textContent?.length ?? 1) * 0.024,
                ease: `steps(${Math.max(1, title.textContent?.length ?? 1)})`, immediateRender: false,
              }, 0.24);
              bars.forEach((bar, index) => {
                const start = starts[index] ?? 1.04;
                animation.fromTo(bar, { scaleX: 0 }, {
                  scaleX: 1, duration: 0.48, ease: relaySpring(120, 26, 0.48), immediateRender: false,
                }, start);
                const row = bar.closest(".landing-chapter__trace-row");
                const check = row?.querySelector("svg path");
                if (check) animation.fromTo(check, { strokeDasharray: "1", strokeDashoffset: 1, attr: { pathLength: 1 } }, {
                  strokeDashoffset: 0, duration: 0.3, ease: relaySpring(280, 32, 0.3), immediateRender: false,
                }, start + 0.24);
                const count = row?.querySelector<HTMLElement>("[data-trace-count]");
                if (count) {
                  const value = Number(count.dataset.traceCount);
                  animation.fromTo(count, { textContent: 0 }, {
                    textContent: value, duration: 0.48, snap: { textContent: 1 },
                    ease: relaySpring(120, 26, 0.48), immediateRender: false,
                  }, start);
                }
              });
            }
            if (approval.length) {
              if (typing) {
                animation.fromTo(typing, { opacity: 0 }, { opacity: 1, duration: 0.2, immediateRender: false }, 0.24)
                  .fromTo(typing.children, { y: 0 }, { y: -3, duration: 0.16, stagger: 0.08, repeat: 3, yoyo: true, immediateRender: false }, 0.36)
                  .to(typing, { opacity: 0, duration: 0.2 }, 1.12);
              }
              animation.fromTo(approval, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.12, ease: "power2.out", immediateRender: false }, 1.16);
              const fields = visual.querySelectorAll(".landing-chapter__approval-details > div");
              if (fields.length) animation.fromTo(fields, { y: 6, opacity: 0 }, {
                y: 0, opacity: 1, duration: 0.4, stagger: 0.112,
                ease: "power2.out", immediateRender: false,
              }, 1.36);
              const actions = visual.querySelectorAll(".landing-chapter__approval > div:last-child > *");
              if (actions.length) animation.fromTo(actions, { y: 6, opacity: 0 }, {
                y: 0, opacity: 1, duration: 0.4, stagger: 0.056,
                ease: relaySpring(280, 32, 0.4), immediateRender: false,
              }, 1.8);
            }
            if (cubes.length) {
              animation.fromTo(cubes, { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, transformOrigin: "50% 100%", duration: 0.8, stagger: 0.12, ease: relaySpring(390, 20.8, 0.8), immediateRender: false }, 0.24)
                .fromTo(caps, { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.12, ease: relaySpring(280, 32, 0.6), immediateRender: false }, 0.448);
              // Last cap finishes at 0.448 + 5 × 0.12 + 0.6 = 1.648s;
              // Relay's glow starts 304ms after it lands.
              if (glow) animation.fromTo(glow, { opacity: 0, scale: 0.8 }, { opacity: 0.8, scale: 1.25, duration: 0.28, ease: "power2.inOut", repeat: 1, yoyo: true, immediateRender: false }, 1.952);
            }
            const prepare = () => {
              if (bars.length) {
                gsap.set(bars, { scaleX: 0 });
                gsap.set(visual.querySelectorAll(".landing-chapter__trace-row svg path"), { strokeDasharray: "1", strokeDashoffset: 1, attr: { pathLength: 1 } });
                gsap.set(visual.querySelectorAll("[data-trace-count]"), { textContent: 0 });
                gsap.set(visual.querySelectorAll(".landing-chapter__trace-title"), { clipPath: "inset(0 100% 0 0)" });
              }
              if (approval.length) {
                gsap.set(approval, { y: 10, opacity: 0 });
                gsap.set(visual.querySelectorAll(".landing-chapter__approval-details > div"), { y: 6, opacity: 0 });
                gsap.set(visual.querySelectorAll(".landing-chapter__approval > div:last-child > *"), { y: 6, opacity: 0 });
              }
              if (typing) gsap.set(typing, { opacity: 0 });
              if (cubes.length) gsap.set(cubes, { scaleY: 0, opacity: 0, transformOrigin: "50% 100%" });
              if (caps.length) gsap.set(caps, { y: -26, opacity: 0 });
              if (glow) gsap.set(glow, { opacity: 0, scale: 0.8 });
            };
            const chartBars = visual.querySelectorAll<HTMLElement>(".landing-volume__bar");
            const loop = relayLoop(animation, approval.length ? 4.472 : 2.072, prepare, chartBars);
            let inView = false;
            let started = false;
            const show = () => {
              inView = true;
              visual.dataset.motion = document.hidden ? "paused" : "playing";
              if (!document.hidden) {
                if (!started) { prepare(); started = true; loop.restart(); }
                else loop.resume();
              }
            };
            const hide = () => { inView = false; visual.dataset.motion = "paused"; loop.pause(); };
            const syncVisibility = () => {
              if (!inView || document.hidden) { visual.dataset.motion = "paused"; loop.pause(); }
              else if (!started) show();
              else { visual.dataset.motion = "playing"; loop.resume(); }
            };
            document.addEventListener("visibilitychange", syncVisibility);
            const visibility = ScrollTrigger.create({ trigger: visual, start: "top 88%", end: "bottom top", onEnter: show, onEnterBack: show, onLeave: hide, onLeaveBack: hide, onRefresh: (self) => { if (self.isActive && !inView) show(); else if (!self.isActive && inView) hide(); } });
            return () => {
              document.removeEventListener("visibilitychange", syncVisibility);
              visibility.kill(); loop.kill(); animation.kill();
              gsap.set(chartBars, { clearProps: "opacity,transform,transformOrigin" });
              const touched = visual.querySelectorAll(".landing-chapter__trace-row b, .landing-chapter__trace-row svg, .landing-chapter__approval > *, .landing-chapter__approval-details > div, .landing-volume__cube, .landing-volume__cap, .landing-volume__glow");
              gsap.set(touched, { clearProps: "opacity,transform" });
              gsap.set(visual.querySelectorAll(".landing-chapter__trace-row svg path"), { clearProps: "strokeDasharray,strokeDashoffset" });
              gsap.set(visual.querySelectorAll(".landing-chapter__trace-title"), { clearProps: "clipPath" });
              gsap.set(visual.querySelectorAll(".landing-chapter__approval > div:last-child > *"), { clearProps: "opacity,transform" });
              visual.querySelectorAll<HTMLElement>("[data-trace-count]").forEach((count) => { count.textContent = count.dataset.traceCount ?? "0"; });
              delete visual.dataset.motion;
            };
          }
        }
        const details = element.querySelectorAll(".landing-showcase__workflows > article");
        if (details.length) {
          gsap.fromTo(details, { y: 12, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.55, stagger: 0.12,
            ease: "power2.out", immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 85%", once: true },
          });
        }
        if (element.classList.contains("landing-case")) {
          const steps = element.querySelectorAll(".landing-case__flow > span");
          gsap.fromTo(steps, { opacity: 0, y: 8 }, {
            opacity: 1, y: 0, duration: 0.45, stagger: 0.14,
            ease: "power2.out", immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          });
        }
        return () => { cleanups.forEach((cleanup) => cleanup()); };

      },
      element,
    );
    return () => media.revert();
  }, [delay, paused, introReady]);
  const props = {
    "aria-label": ariaLabel,
    role: as === "footer" ? ("contentinfo" as const) : undefined,
    className: ["landing-reveal", className].filter(Boolean).join(" "),
  };
  const ref = (element: HTMLElement | null) => {
    root.current = element;
  };
  // Native markup is fully readable before hydration; GSAP enhances entry only.
  if (as === "article")
    return (
      <article {...props} ref={ref}>
        {children}
      </article>
    );
  if (as === "footer")
    return (
      <footer {...props} ref={ref}>
        {children}
      </footer>
    );
  return (
    <div {...props} ref={ref}>
      {children}
    </div>
  );
}
