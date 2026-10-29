"use client";

import { Canvas, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DoubleSide,
  Vector2,
  type Texture,
  type ShaderMaterial,
} from "three";
import {
  createRibbonField,
  createRibbonTexture,
  blendRibbonField,
  type LightWaypoint,
} from "./landing-ribbon-geometry";
import {
  ribbonFragmentShader,
  ribbonVertexShader,
} from "./landing-ribbon-shader";
import "lenis/dist/lenis.css";

type PageLayout = {
  width: number;
  height: number;
  pageHeight: number;
  heroEnd: number;
  points: LightWaypoint[];
};

const waypoints = [
  { selector: ".landing-hero", x: [0.97, 0.43, 0.71], at: [-0.1, 0.62, 1.05] },
  { selector: "#product", x: [0.82, 0.1], at: [0.15, 0.85] },
  { selector: "#narrative", x: [0.04, 0.8], at: [0.16, 0.85] },
  { selector: ".landing-statement", x: [0.95], at: [0.5] },
  { selector: ".landing-reliability", x: [1.02, 0.83], at: [0.1, 0.8] },
  { selector: "#daily-view", x: [0.58, 0.02], at: [0.2, 0.95] },
  { selector: ".landing-cases", x: [0.04, 0.55], at: [0.18, 0.85] },
  { selector: "#usage", x: [0.9, 1.05], at: [0.15, 0.9] },
  { selector: "#faq", x: [0.78, 0.22], at: [0.2, 0.9] },
  { selector: ".landing-cta", x: [0.08, 0.62], at: [0.25, 0.95] },
];

function measurePage(page: HTMLElement): PageLayout {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pageHeight = page.scrollHeight;
  const points: LightWaypoint[] = [{ x: 1.25, y: -height * 0.4, z: 0 }];
  const hero = page.querySelector<HTMLElement>(".landing-hero");
  const heroEnd = hero ? hero.getBoundingClientRect().bottom + window.scrollY : height;
  waypoints.forEach((waypoint, sectionIndex) => {
    const section = page.querySelector<HTMLElement>(waypoint.selector);
    if (!section) return;
    const bounds = section.getBoundingClientRect();
    waypoint.x.forEach((x, index) => points.push({
      x, y: bounds.top + window.scrollY + bounds.height * (waypoint.at[index] ?? 0.5),
      z: Math.sin(sectionIndex + index * 0.8) * 0.8,
    }));
  });
  points.push({ x: 0.9, y: pageHeight + 200, z: 0 });
  return { width, height, pageHeight, heroEnd, points };
}

function sameLayout(a: PageLayout, b: PageLayout) {
  return a.width === b.width && a.height === b.height &&
    a.pageHeight === b.pageHeight && Math.abs(a.heroEnd - b.heroEnd) < 0.5 &&
    a.points.length === b.points.length &&
    a.points.every((point, index) => Math.abs(point.y - b.points[index]!.y) < 0.5);
}

function Stream({
  onReady,
  onFailure,
  playIntro,
}: {
  onReady: () => void;
  onFailure: () => void;
  playIntro: boolean;
}) {
  const material = useRef<ShaderMaterial>(null);
  const clock = useRef<number | null>(null);
  const introOnMount = useRef(playIntro);
  const { gl, advance } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHead: { value: 0 },
      uHeroEnd: { value: 7 },
      uResolution: { value: new Vector2() },
      uPath: { value: null as Texture | null },
      uPathRange: { value: new Vector2() },
      uViewportHeight: { value: 1 },
      uScroll: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".landing-page");
    if (!page) return;
    gsap.registerPlugin(ScrollTrigger);
    let layout = measurePage(page);
    const field = createRibbonField(layout.points, layout.width);
    const texture = createRibbonTexture(field);
    let from = { ...field, values: field.values.slice() };
    let target = from;
    const morph = { progress: 1 };
    let morphTween: gsap.core.Tween | undefined;
    let fieldChanged = false;
    let dirty = false;
    let lastMeasured = 0;
    const invalidate = () => { dirty = true; };

    // One instance, texture and ticker per scene lifetime. Changing layout is
    // data, not a reason to restart scrolling, the shader clock or GPU objects.
    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      lerp: 0.1,
      anchors: { offset: -100 },
    });
    lenis.on("scroll", ScrollTrigger.update);
    const observer = new ResizeObserver(invalidate);
    observer.observe(page);
    window.addEventListener("resize", invalidate);
    page.addEventListener("fluxora:layout-settled", invalidate);
    ScrollTrigger.addEventListener("refresh", invalidate);

    const retarget = () => {
      const next = measurePage(page);
      if (sameLayout(layout, next)) return;
      layout = next;
      morphTween?.kill();
      // Capture the last rendered field, including an interrupted morph.
      from = { ...field, values: field.values.slice() };
      target = createRibbonField(next.points, next.width);
      morph.progress = 0;
      fieldChanged = true;
      morphTween = gsap.to(morph, {
        progress: 1, duration: 0.6, ease: "power2.out",
        onUpdate: () => { fieldChanged = true; },
      });
      // Recompute downstream reveal/pin positions, without replacing their owners.
      ScrollTrigger.refresh();
    };

    clock.current ??=
      introOnMount.current && window.scrollY < layout.height * 0.5 ? 0 : 3;
    let previousTime = 0;
    let announced = false;
    const tick = (time: number) => {
      lenis.raf(time * 1000);
      // Coalesce resize notifications; animated disclosures publish their final
      // layout once. Until then, keep drawing the existing field continuously.
      if (dirty && time - lastMeasured >= 0.08 && !page.querySelector('[data-animating="true"]')) {
        dirty = false;
        lastMeasured = time;
        retarget();
      }
      if (fieldChanged) {
        blendRibbonField(field, from, target, morph.progress);
        texture.needsUpdate = true;
        fieldChanged = false;
      }
      clock.current =
        (clock.current ?? 0) +
        (previousTime ? Math.min(time - previousTime, 0.15) : 0);
      previousTime = time;
      const live = material.current?.uniforms;
      if (live?.uTime) live.uTime.value = clock.current;
      if (live?.uPath) live.uPath.value = texture;
      if (live?.uPathRange) live.uPathRange.value.set(field.minY, field.maxY);
      if (live?.uViewportHeight)
        live.uViewportHeight.value = (window.innerHeight / window.innerWidth) * 10;
      // Absolute document coordinates: page-height changes cannot remap the
      // current scroll position or move the entire background.
      if (live?.uScroll) live.uScroll.value = (window.scrollY / window.innerWidth) * 10;
      if (live?.uHeroEnd) live.uHeroEnd.value = (layout.heroEnd / layout.width) * 10;
      if (live?.uHead)
        live.uHead.value =
          clock.current < 2.6 && window.scrollY < layout.height * 0.5
            ? (clock.current / 2.6) * ((layout.heroEnd / layout.width) * 10 + 16)
            : 100000;
      if (live?.uResolution?.value instanceof Vector2)
        gl.getDrawingBufferSize(live.uResolution.value);
      advance(time, false);
      if (!announced) { announced = true; onReady(); }
    };
    gsap.ticker.add(tick);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", invalidate);
      page.removeEventListener("fluxora:layout-settled", invalidate);
      ScrollTrigger.removeEventListener("refresh", invalidate);
      gsap.ticker.remove(tick);
      morphTween?.kill();
      texture.dispose();
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
    };
  }, [gl, advance, onReady]);

  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onFailure]);

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
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
  );
}

export function LightStreamScene(props: {
  onReady: () => void;
  onFailure: () => void;
  playIntro: boolean;
}) {
  const [pixelRatio, setPixelRatio] = useState(1);
  return (
    <Canvas
      aria-hidden="true"
      orthographic
      camera={{ manual: true, near: 0.1, far: 50 }}
      dpr={pixelRatio}
      onCreated={({ gl }) => {
        // Local-only capability check; DOM text always retains native resolution.
        const context = gl.getContext();
        if (!context.getExtension("OES_texture_float_linear")) {
          props.onFailure();
          return;
        }
        const info = context.getExtension("WEBGL_debug_renderer_info");
        const renderer = info
          ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL))
          : "";
        setPixelRatio(
          /swiftshader|llvmpipe|software/i.test(renderer)
            ? 0.5
            : Math.min(window.devicePixelRatio, 1.25),
        );
      }}
      frameloop="never"
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
    >
      <Stream {...props} />
    </Canvas>
  );
}
