"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { uiMotion } from "./ui-motion";

type ProgressProps = {
  label: string;
  value?: number;
  className?: string;
};

export function Progress({ label, value, className }: ProgressProps) {
  const determinate = typeof value === "number";
  const normalized = determinate ? Math.max(0, Math.min(100, value)) : undefined;
  const bar = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const current = useRef((normalized ?? 0) / 100);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const media = gsap.matchMedia();
    media.add({ animate: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (context) => {
      if (!context.conditions?.animate) {
        if (normalized !== undefined) current.current = normalized / 100;
        gsap.set(element, normalized !== undefined ? { scaleX: normalized / 100 } : { xPercent: 0 });
        return;
      }
      if (normalized !== undefined) {
        gsap.fromTo(element, { scaleX: current.current }, {
          scaleX: normalized / 100, duration: uiMotion.standard, ease: uiMotion.ease,
          onUpdate() { current.current = Number(gsap.getProperty(element, "scaleX")); },
        });
        return;
      }
      const tween = gsap.fromTo(element, { xPercent: -120 }, { xPercent: 240, duration: 1.2, repeat: -1, ease: "power1.inOut" });
      let visible = true;
      const sync = () => { tween.paused(document.hidden || !visible); };
      const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; sync(); });
      // Observe the stationary track, not the bar that travels outside it.
      if (track.current) observer.observe(track.current);
      document.addEventListener("visibilitychange", sync);
      sync();
      return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
    }, element);
    return () => media.revert();
  }, [normalized]);
  return (
    <div className={["ui-progress", className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <span>{label}</span>
      <span ref={track} className="ui-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized}>
        <span ref={bar} className="ui-progress__value" style={determinate ? { width: "100%", transform: `scaleX(${normalized! / 100})`, transformOrigin: "left" } : undefined} />
      </span>
    </div>
  );
}
