"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Motion enhances the public pages; server-rendered content remains readable. */
export function PublicMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!root.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia(root.current);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = gsap.utils.toArray<HTMLElement>(".public-intro, .public-section, .public-support-card, .plan-card", root.current!);
      targets.forEach((element) => {
        // Never dim content already painted in the viewport during hydration.
        if (element.getBoundingClientRect().top < window.innerHeight) return;
        gsap.fromTo(element, { y: 14, opacity: 0.55 }, {
          y: 0, opacity: 1, duration: 0.55, ease: "power2.out", clearProps: "transform,opacity",
          immediateRender: false, scrollTrigger: { trigger: element, start: "top 96%", once: true },
        });
      });
    });
    return () => media.revert();
  }, []);
  return <div ref={root}>{children}</div>;
}
