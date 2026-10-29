"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useState, type ReactNode } from "react";

const LandingEffectsContext = createContext({
  paused: false,
  togglePaused: () => {},
});

export function useLandingEffects() {
  return useContext(LandingEffectsContext);
}

export function LandingMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <LandingEffectsContext.Provider
      value={{ paused, togglePaused: () => setPaused((value) => !value) }}
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
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
  as?: "article" | "div";
  children: ReactNode;
  className?: string;
  delay?: number;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const motionProps = {
    "aria-label": ariaLabel,
    className: ["landing-reveal", className].filter(Boolean).join(" "),
    initial: false,
    whileInView: reduceMotion
      ? undefined
      : { y: [18, 0], opacity: [0.55, 1], filter: ["blur(3px)", "blur(0px)"] },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
  };

  // Keep server-rendered content readable before IntersectionObserver hydrates.
  // Motion is a subtle polish, never a gate for the landing's information.
  return as === "article" ? (
    <motion.article {...motionProps}>{children}</motion.article>
  ) : (
    <motion.div {...motionProps}>{children}</motion.div>
  );
}
