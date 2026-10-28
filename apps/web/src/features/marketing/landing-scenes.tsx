"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const HeroThreeScene = dynamic(
  () => import("./landing-three-scenes").then((module) => module.HeroThreeScene),
  { ssr: false, loading: () => null },
);
const LifecycleThreeScene = dynamic(
  () => import("./landing-three-scenes").then((module) => module.LifecycleThreeScene),
  { ssr: false, loading: () => null },
);

function canUseWebGl() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

function useSceneAvailability() {
  const ref = useRef<HTMLDivElement>(null);
  const [webGl, setWebGl] = useState(false);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    setWebGl(canUseWebGl());
    const onVisibilityChange = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!ref.current || !webGl) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), {
      rootMargin: "120px",
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [webGl]);

  return { ref, enabled: webGl && inView && tabVisible, supported: webGl };
}

function SceneIsland({ kind }: { kind: "hero" | "lifecycle" }) {
  const scene = useSceneAvailability();
  const state = scene.enabled ? "running" : scene.supported ? "paused" : "fallback";

  return (
    <div ref={scene.ref} className={`landing-scene landing-scene--${kind}`} data-scene-state={state} aria-hidden="true">
      {scene.enabled && (kind === "hero" ? <HeroThreeScene /> : <LifecycleThreeScene />)}
    </div>
  );
}

export function LandingHeroVisual() {
  return <SceneIsland kind="hero" />;
}

export function LandingLifecycleVisual() {
  return <SceneIsland kind="lifecycle" />;
}
