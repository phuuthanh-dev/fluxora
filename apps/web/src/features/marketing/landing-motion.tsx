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
        const scale = gsap.quickTo(element, "scale", {
          duration: 0.2,
          ease: "power2.out",
        });
        const alpha = gsap.quickTo(element, "autoAlpha", {
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
        gsap.set(element, { x: -200, y: -200, autoAlpha: 0, scale: 1 });
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
        const targets = element.matches(".landing-footer")
          ? Array.from(element.children)
          : element;
        gsap.fromTo(
          targets,
          { y: 24, opacity: 0.3, filter: "blur(8px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 0.75,
            delay,
            stagger: 0.07,
            ease: "power2.out",
            immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 94%", once: true },
          },
        );
        // Give each heading and its supporting copy its own focus-in, as in
        // Relay, while retaining the enclosing section's softer rise.
        const text = element.querySelectorAll(
          ":scope > h2, :scope > div > h2, :scope > p:not(.landing-eyebrow)",
        );
        if (text.length) {
          gsap.fromTo(text,
            { opacity: 0, filter: "blur(8px)", clipPath: "inset(0 100% 0 0)" },
            { opacity: 1, filter: "blur(0px)", clipPath: "inset(0 0% 0 0)", duration: 0.9,
              stagger: 0.14, delay: delay + 0.07, ease: "power2.out", immediateRender: false,
              scrollTrigger: { trigger: element, start: "top 90%", once: true } },
          );
        }
        if (element.classList.contains("landing-daily__grid")) {
          const cells = element.querySelectorAll(".landing-heatmap td > span");
          gsap.fromTo(cells, { opacity: 0, scale: 0.75 }, {
            opacity: 1, scale: 1, duration: 0.45, stagger: { each: 0.025, from: "start" },
            ease: "power2.out", immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 85%", once: true },
          });
        }
        if (element.classList.contains("landing-volume__chart")) {
          gsap.fromTo(element.querySelectorAll(".landing-volume__bar"),
            { scaleY: 0, opacity: 0 },
            { scaleY: 1, opacity: 1, duration: 0.8, stagger: 0.09, ease: "power3.out", immediateRender: false,
              scrollTrigger: { trigger: element, start: "top 85%", once: true } },
          );
        }
        const traceBars = element.querySelectorAll(".landing-chapter__trace-row b");
        if (traceBars.length) {
          gsap.fromTo(traceBars, { scaleX: 0 }, {
            scaleX: 1, duration: 0.7, stagger: 0.2, ease: "power2.out", immediateRender: false,
            scrollTrigger: { trigger: element, start: "top 85%", once: true },
          });
        }
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
