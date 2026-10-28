"use client";

import { Canvas, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DoubleSide,
  OrthographicCamera,
  Vector2,
  type ShaderMaterial,
} from "three";
import {
  createLightRibbon,
  type LightWaypoint,
} from "./landing-ribbon-geometry";
import {
  ribbonFragmentShader,
  ribbonVertexShader,
} from "./landing-ribbon-shader";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

type PageLayout = {
  width: number;
  height: number;
  pageHeight: number;
  points: LightWaypoint[];
};

const waypoints = [
  { selector: ".landing-hero", x: [0.73, 0.48, 0.95] },
  { selector: "#product", x: [0.95, 0.16, 0.03] },
  { selector: "#narrative", x: [0.04, 0.64, 0.94] },
  { selector: ".landing-statement", x: [0.94, 0.65, 0.18] },
  { selector: ".landing-reliability", x: [0.18, 0.05, 0.55] },
  { selector: "#daily-view", x: [0.55, 0.91, 0.98] },
  { selector: ".landing-cases", x: [0.96, 0.4, 0.02] },
  { selector: "#usage", x: [0.03, 0.35, 0.9] },
  { selector: "#faq", x: [0.91, 0.95, 0.5] },
  { selector: ".landing-cta", x: [0.5, 0.08, 0.8] },
];

function Stream({
  onReady,
  onFailure,
}: {
  onReady: () => void;
  onFailure: () => void;
}) {
  const material = useRef<ShaderMaterial>(null);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const { gl, camera, advance } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uResolution: { value: new Vector2() },
    }),
    [],
  );

  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>(".landing-page");
    if (!page) return;
    const measure = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pageHeight = page.scrollHeight;
      const points: LightWaypoint[] = [{ x: 0.65, y: -180, z: 0 }];
      waypoints.forEach((waypoint, sectionIndex) => {
        const section = page.querySelector<HTMLElement>(waypoint.selector);
        if (!section) return;
        const bounds = section.getBoundingClientRect();
        waypoint.x.forEach((x, index) =>
          points.push({
            x,
            y:
              bounds.top +
              window.scrollY +
              bounds.height * (0.12 + index * 0.38),
            z: Math.sin(sectionIndex + index * 0.8) * 0.8,
          }),
        );
      });
      points.push({ x: 0.9, y: pageHeight + 200, z: 0 });
      setLayout((previous) =>
        previous?.width === width &&
        previous.height === height &&
        previous.pageHeight === pageHeight
          ? previous
          : { width, height, pageHeight, points },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const geometry = useMemo(
    () => (layout ? createLightRibbon(layout.points, layout.width) : null),
    [layout],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  useLayoutEffect(() => {
    if (!layout || !(camera instanceof OrthographicCamera)) return;
    const visibleHeight = (layout.height / layout.width) * 10;
    camera.left = -5;
    camera.right = 5;
    camera.top = visibleHeight / 2;
    camera.bottom = -visibleHeight / 2;
    camera.position.set(
      0,
      -visibleHeight / 2 - (window.scrollY / layout.width) * 10,
      10,
    );
    camera.updateProjectionMatrix();
  }, [layout, camera]);

  useEffect(() => {
    if (!layout) return;
    const page = document.querySelector<HTMLElement>(".landing-page");
    if (!page) return;
    const distance = Math.max(1, layout.pageHeight - layout.height);
    const state = { progress: window.scrollY / distance };
    // Only this landing's instance owns smooth wheel scrolling. Touch remains
    // native, anchors keep their hrefs, and destroy() restores native scrolling.
    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      lerp: 0.1,
      anchors: { offset: -100 },
    });
    lenis.on("scroll", ScrollTrigger.update);
    const tween = gsap.fromTo(
      state,
      { progress: 0 },
      {
        progress: 1,
        ease: "none",
        scrollTrigger: {
          trigger: page,
          start: "top top",
          end: () => `+=${distance}`,
          scrub: 0.35,
          invalidateOnRefresh: true,
        },
      },
    );
    tween.scrollTrigger?.refresh();
    tween.progress(window.scrollY / distance);
    let elapsed = 0;
    let previousTime = 0;
    const tick = (time: number) => {
      lenis.raf(time * 1000);
      // Avoid a jump after a background tab or a resumed scene.
      elapsed += previousTime ? Math.min(time - previousTime, 0.05) : 0;
      previousTime = time;
      camera.position.y =
        (-(layout.height / 2 + state.progress * distance) / layout.width) * 10;
      camera.updateMatrixWorld();
      const live = material.current?.uniforms;
      if (live?.uTime) live.uTime.value = elapsed;
      if (live?.uProgress) live.uProgress.value = state.progress;
      if (live?.uResolution?.value instanceof Vector2)
        gl.getDrawingBufferSize(live.uResolution.value);
      // R3F never creates another RAF loop; GSAP advances Lenis and this scene.
      advance(time, false);
    };
    gsap.ticker.add(tick);
    onReady();
    return () => {
      gsap.ticker.remove(tick);
      tween.scrollTrigger?.kill();
      tween.kill();
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
    };
  }, [layout, gl, camera, advance, onReady]);

  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onFailure]);

  return geometry ? (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={ribbonVertexShader}
        fragmentShader={ribbonFragmentShader}
        side={DoubleSide}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  ) : null;
}

export function LightStreamScene(props: {
  onReady: () => void;
  onFailure: () => void;
}) {
  return (
    <Canvas
      aria-hidden="true"
      orthographic
      camera={{ near: 0.1, far: 50 }}
      dpr={[1, 1.25]}
      frameloop="never"
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
    >
      <Stream {...props} />
    </Canvas>
  );
}
