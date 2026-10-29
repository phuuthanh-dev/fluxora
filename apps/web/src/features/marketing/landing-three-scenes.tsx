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
  type Texture,
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
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const { gl, camera, advance } = useThree();
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

  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>(".landing-page");
    if (!page) return;
    const measure = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pageHeight = page.scrollHeight;
      const points: LightWaypoint[] = [{ x: 1.25, y: -height * 0.4, z: 0 }];
      const hero = page.querySelector<HTMLElement>(".landing-hero");
      const heroEnd = hero
        ? hero.getBoundingClientRect().bottom + window.scrollY
        : height;
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
              bounds.height * (waypoint.at[index] ?? 0.5),
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
          : { width, height, pageHeight, heroEnd, points },
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
  useEffect(
    () => () => {
      geometry?.geometry.dispose();
      geometry?.texture.dispose();
    },
    [geometry],
  );

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
    if (!layout || !geometry) return;
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
    clock.current ??=
      introOnMount.current && window.scrollY < layout.height * 0.5 ? 0 : 3;
    let previousTime = 0;
    let announced = false;
    const tick = (time: number) => {
      lenis.raf(time * 1000);
      // Avoid a jump after a background tab or a resumed scene.
      clock.current =
        (clock.current ?? 0) +
        (previousTime ? Math.min(time - previousTime, 0.15) : 0);
      previousTime = time;
      camera.position.y =
        (-(layout.height / 2 + state.progress * distance) / layout.width) * 10;
      camera.updateMatrixWorld();
      const live = material.current?.uniforms;
      if (live?.uTime) live.uTime.value = clock.current;
      if (live?.uPath) live.uPath.value = geometry.texture;
      if (live?.uPathRange)
        live.uPathRange.value.set(geometry.minY, geometry.maxY);
      if (live?.uViewportHeight)
        live.uViewportHeight.value = (layout.height / layout.width) * 10;
      if (live?.uScroll)
        live.uScroll.value = ((state.progress * distance) / layout.width) * 10;
      if (live?.uHeroEnd)
        live.uHeroEnd.value = (layout.heroEnd / layout.width) * 10;
      if (live?.uHead)
        live.uHead.value =
          clock.current < 2.6 && window.scrollY < layout.height * 0.5
            ? (clock.current / 2.6) *
              ((layout.heroEnd / layout.width) * 10 + 16)
            : 100000;
      if (live?.uResolution?.value instanceof Vector2)
        gl.getDrawingBufferSize(live.uResolution.value);
      // R3F never creates another RAF loop; GSAP advances Lenis and this scene.
      advance(time, false);
      if (!announced) {
        announced = true;
        onReady();
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      tween.scrollTrigger?.kill();
      tween.kill();
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
    };
  }, [layout, geometry, gl, camera, advance, onReady]);

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
    <mesh geometry={geometry.geometry} frustumCulled={false}>
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
