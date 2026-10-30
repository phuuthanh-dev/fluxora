"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LandingIntro } from "./landing-intro";

const LandingEffectsContext = createContext({
  paused: false,
  introReady: false,
  togglePaused: () => {},
});

export function useLandingEffects() {
  return useContext(LandingEffectsContext);
}

export function LandingMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const releaseIntro = useCallback(() => setIntroReady(true), []);
  return (
    <LandingEffectsContext.Provider
      value={{
        paused,
        introReady,
        togglePaused: () => setPaused((value) => !value),
      }}
    >
      <LandingIntro onComplete={releaseIntro} />
      {children}
    </LandingEffectsContext.Provider>
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
  useEffect(() => {
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
