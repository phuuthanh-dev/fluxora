"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function LandingMotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function LandingReveal({ as = "div", children, className, delay = 0, ariaLabel }: {
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
    initial: reduceMotion ? false : { opacity: 0.96 },
    whileInView: reduceMotion ? undefined : { opacity: 1 },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: 0.56, delay, ease: [0.22, 1, 0.36, 1] as const },
  };

  // Keep server-rendered content readable before IntersectionObserver hydrates.
  // Motion is a subtle polish, never a gate for the landing's information.
  return as === "article"
    ? <motion.article {...motionProps}>{children}</motion.article>
    : <motion.div {...motionProps}>{children}</motion.div>;
}
