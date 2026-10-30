"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  blendRibbonField,
  createRibbonField,
  createRibbonTexture,
  type LightWaypoint,
  type RibbonField,
} from "./landing-ribbon-geometry";
import {
  createStreamFilaments,
  createStreamParticles,
  STREAM_BUDGET,
} from "./landing-stream-particles";
import {
  spinePrelude,
  pointsVertex,
  pointsFragment,
  linesVertex,
  linesFragment,
} from "./landing-ribbon-shader";
import "lenis/dist/lenis.css";

type Layout = {
  width: number;
  height: number;
  unit: number;
  points: LightWaypoint[];
};
/** offsetTop is independent of reveal transforms and pinned child geometry. */
function documentTop(element: HTMLElement) {
  let y = 0;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.offsetParent as HTMLElement | null
  )
    y += node.offsetTop;
  return y;
}
function measurePage(page: HTMLElement, canvas: HTMLCanvasElement): Layout {
  const width = window.innerWidth,
    height = canvas.clientHeight;
  const unit = Math.min(1.33, Math.max(0.65, width / 1440));
  const column = page
    .querySelector<HTMLElement>(".landing-container")!
    .getBoundingClientRect();
  const mobile = width <= 900;
  const anchors: [string, number, number, number, number?][] = [
    [".landing-hero", 1.14, -0.46, -2.6],
    [".landing-hero", 0.84, 0.02, -1.8],
    [".landing-hero", 0.5, 0.3, -0.9],
    [".landing-hero", mobile ? -0.02 : 0.22, mobile ? 0.84 : 0.66, 0, 1],
    ["#integrations", 0.48, -0.25, 0],
    ["#integrations", 0.605, 0.54, -0.2],
    ["#product", 0.5, 0.12, 0.2],
    ["#product", -0.06, 0.5, 0.2, 1],
    ["#narrative", 0.42, 0.7, -0.3],
    [".landing-statement", 0.5, 0.3, -0.5],
    [".landing-reliability", 0.92, 0.9, 0.2, 1],
    ["#daily-view", 0.4, 0.75, -0.4],
    [".landing-cases", -0.06, 0.6, 0.2, 1],
    ["#usage", 0.46, -0.1, -0.2],
    ["#usage", 0.96, 0.35, 0.1, 0.8],
    ["#usage", 0.48, 0.85, 0],
    ["#faq", -0.12, 0.55, 0],
    [".landing-footer", 0.8, 1, 0],
  ];
  const points: LightWaypoint[] = [];
  for (const [selector, x, y, z, pinch] of anchors) {
    const section = page.querySelector<HTMLElement>(selector);
    if (!section) continue;
    const top = documentTop(section) + section.offsetHeight * y;
    points.push({
      x: column.left + (x + 200 / 1440) * column.width,
      y: Math.max(top, (points.at(-1)?.y ?? -Infinity) + 1),
      z,
      pinch,
    });
  }
  return { width, height, unit, points };
}
function equalLayout(a: Layout, b: Layout) {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.points.length === b.points.length &&
    a.points.every(
      (p, i) =>
        Math.abs(p.y - b.points[i]!.y) < 0.5 &&
        Math.abs(p.x - b.points[i]!.x) < 0.5,
    )
  );
}

/** Single lifetime for canvas, geometry, composer, Lenis and ticker. */
export function LightStreamScene({
  onReady,
  onFailure,
  playIntro,
}: {
  onReady: () => void;
  onFailure: () => void;
  playIntro: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialIntro = useRef(playIntro);
  useEffect(() => {
    const host = hostRef.current,
      page = document.querySelector<HTMLElement>(".landing-page");
    if (!host || !page) return;
    // Each effect owns a distinct context, including Strict Mode's replay.
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
    });
    host.appendChild(canvas);
    gsap.registerPlugin(ScrollTrigger);
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      canvas.remove();
      onFailure();
      return;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.debug.onShaderError = () => onFailure();
    const context = renderer.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    const software = info
      ? /swiftshader|llvmpipe|software/i.test(
          String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)),
        )
      : false;
    const coarse = window.matchMedia("(pointer: coarse)");
    let layout = measurePage(page, canvas);
    const field = createRibbonField(layout.points, layout.unit),
      texture = createRibbonTexture(field);
    const snapshot = (): RibbonField => ({
      ...field,
      values: field.values.slice(),
    });
    let from = snapshot(),
      target = from;
    const morph = { progress: 1 };
    let morphTween: gsap.core.Tween | undefined;
    let dirty = false,
      changed = false,
      cancelled = false,
      ready = false;
    let lastMeasured = 0,
      lastRender = 0,
      lastTick = 0,
      elapsed = 0,
      scrollDistance = 0;
    let previousScroll = window.scrollY;
    const intro =
      initialIntro.current && previousScroll < window.innerHeight / 2;
    const style = getComputedStyle(page);
    const color = (token: string) =>
      new Color(style.getPropertyValue(token).trim());
    const uniforms = {
      uCurve: { value: texture },
      uHalfH: { value: 6 * Math.tan(((35 / 2) * Math.PI) / 180) },
      uCamZ: { value: 6 },
      uPx: { value: 1 },
      uLen: { value: field.length },
      uView: { value: new Vector3() },
      uTime: { value: 0 },
      uTimeS: { value: 0 },
      uFlow: { value: 0 },
      uScrollU: { value: 0 },
      uTurnHold: { value: 0.5 },
      uBreath: { value: 0.35 },
      uBreathWave: { value: 900 },
      uBreathSpeed: { value: 0.6 },
      uRevealPx: { value: intro ? 0 : 1e7 },
      uFadeIn: { value: 120 },
      uFadeOut: { value: 400 },
      uSpread: { value: 8 },
      uSpreadEnds: { value: 190 },
      uSpray: { value: 2.4 },
      uBokeh: { value: 3.2 },
      uDust: { value: 5.5 },
      uWobble: { value: 4 },
      uSize: { value: 2.1 },
      uScale: { value: 1 },
      uFocal: { value: 0.15 },
      uDof: { value: 0.55 },
      uDofSize: { value: 2.2 },
      uTwinkle: { value: 2.4 },
      uHeat: { value: 1.2 },
      uBright: { value: 0.79 },
      uAltShare: { value: 0.45 },
      uAltStrands: { value: 0.32 },
      uColMain: { value: color("--stream-main") },
      uColAlt: { value: color("--stream-alt") },
      uColCore: { value: color("--stream-core") },
      uColDeep: { value: color("--stream-deep") },
      uColSpark: { value: new Color("white") },
      uLineSpread: { value: 0.9 },
      uLineWavelength: { value: 1560 },
      uLineWaveAmp: { value: 0.22 },
      uLineWaveSpeed: { value: 0.25 },
      uPulseGain: { value: 1.4 },
      uLineBase: { value: 0.16 },
      uPulseSpacing: { value: 1130 },
      uPulseShift: { value: 0 },
      uPulseSharp: { value: 9 },
    };
    const common = {
      uniforms,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    };
    const particles = new Points(
      createStreamParticles(),
      new ShaderMaterial({
        ...common,
        vertexShader: spinePrelude + pointsVertex,
        fragmentShader: pointsFragment,
      }),
    );
    const lineSegments = software ? 240 : STREAM_BUDGET.segments;
    const lines = new LineSegments(
      createStreamFilaments(lineSegments),
      new ShaderMaterial({
        ...common,
        vertexShader: spinePrelude + linesVertex,
        fragmentShader: linesFragment,
      }),
    );
    particles.frustumCulled = lines.frustumCulled = false;
    const scene = new Scene();
    scene.add(particles, lines);
    const camera = new PerspectiveCamera(35, 1, 0.1, 60);
    camera.position.z = 6;
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera),
      bloom = new UnrealBloomPass(new Vector2(1, 1), 0.68, 0.57, 0.07),
      output = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloom);
    // Multi-pass bloom and dense line tessellation overwhelm CPU rasterizers.
    // Keep real particles/filaments, but use their additive glow on this tier.
    bloom.enabled = !software;
    composer.addPass(output);
    let low = false;
    const resize = () => {
      low = software || coarse.matches || layout.width <= 900;
      const dpr = software
        ? 0.5
        : Math.min(window.devicePixelRatio, low ? 1.2 : 1.35);
      renderer.setPixelRatio(dpr);
      renderer.setSize(layout.width, layout.height, false);
      composer.setPixelRatio(dpr);
      composer.setSize(layout.width, layout.height);
      if (low)
        bloom.setSize(
          Math.ceil(layout.width * dpr * 0.5),
          Math.ceil(layout.height * dpr * 0.5),
        );
      camera.aspect = layout.width / layout.height;
      camera.updateProjectionMatrix();
      particles.geometry.setDrawRange(
        0,
        Math.floor(STREAM_BUDGET.points * (software ? 0.08 : low ? 0.45 : 1)),
      );
      lines.geometry.setDrawRange(
        0,
        Math.ceil(STREAM_BUDGET.strands * (software ? 0.14 : low ? 0.6 : 1)) *
          lineSegments *
          2,
      );
      uniforms.uScale.value = layout.unit * dpr;
      uniforms.uPx.value = layout.unit / (layout.height / 2);
      uniforms.uFadeIn.value = 120 * layout.unit;
      uniforms.uBreathWave.value = 900 * layout.unit;
      uniforms.uLineWavelength.value = 1560 * layout.unit;
      uniforms.uPulseSpacing.value = 1130 * layout.unit;
    };
    resize();
    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      lerp: 0.1,
      anchors: { offset: -100 },
    });
    lenis.on("scroll", ScrollTrigger.update);
    const invalidate = () => {
      dirty = true;
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(page);
    window.addEventListener("resize", invalidate);
    coarse.addEventListener("change", invalidate);
    page.addEventListener("fluxora:layout-settled", invalidate);
    ScrollTrigger.addEventListener("refresh", invalidate);
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", lost);
    const pointer = new Vector2(),
      look = new Vector2();
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || coarse.matches) return;
      pointer.set(
        (event.clientX / layout.width) * 2 - 1,
        1 - (event.clientY / layout.height) * 2,
      );
    };
    const leave = () => pointer.set(0, 0);
    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    const tick = (time: number) => {
      if (cancelled) return;
      lenis.raf(time * 1000);
      const dt = lastTick ? Math.min(0.1, Math.max(0, time - lastTick)) : 0;
      lastTick = time;
      elapsed += dt;
      scrollDistance += Math.abs(lenis.scroll - previousScroll) * 1.25;
      previousScroll = lenis.scroll;
      if (
        dirty &&
        time - lastMeasured >= 0.08 &&
        !page.querySelector('[data-animating="true"]')
      ) {
        dirty = false;
        lastMeasured = time;
        const next = measurePage(page, canvas);
        if (!equalLayout(layout, next)) {
          const viewportChanged =
            layout.width !== next.width || layout.height !== next.height;
          layout = next;
          morphTween?.kill();
          from = snapshot();
          target = createRibbonField(layout.points, layout.unit);
          morph.progress = 0;
          changed = true;
          morphTween = gsap.to(morph, {
            progress: 1,
            duration: 0.6,
            ease: "power2.out",
            onUpdate: () => {
              changed = true;
            },
          });
          if (viewportChanged) resize();
          lenis.resize();
          ScrollTrigger.refresh();
        }
        if (low !== (software || coarse.matches || layout.width <= 900))
          resize();
      }
      if (changed) {
        blendRibbonField(field, from, target, morph.progress);
        texture.needsUpdate = true;
        changed = false;
      }
      if (time - lastRender < (software ? 0.04 : low ? 0.02 : 0)) return;
      lastRender = time;
      look.lerp(pointer, 1 - Math.exp(-3.2 * dt));
      camera.position.set(-look.x * 0.22, look.y * 0.22, 6);
      camera.lookAt(0, 0, 0);
      uniforms.uTime.value = elapsed;
      uniforms.uTimeS.value = elapsed % 1000;
      uniforms.uLen.value = field.length;
      uniforms.uFadeOut.value = Math.min(field.length / 4, 400 * layout.unit);
      uniforms.uFlow.value = (90 * layout.unit) / field.length;
      uniforms.uScrollU.value = (scrollDistance / field.length) % 1;
      uniforms.uView.value.set(
        layout.width / 2,
        layout.height / 2,
        lenis.scroll,
      );
      const t = Math.min(1, Math.max(0, (elapsed - 0.416) / 2.2));
      uniforms.uRevealPx.value =
        intro && t < 1 ? (1 - (1 - t) ** 3) * 2600 * layout.unit : 1e7;
      uniforms.uPulseShift.value =
        (elapsed * 205 * layout.unit + scrollDistance) %
        uniforms.uPulseSpacing.value;
      try {
        composer.render(dt);
        if (!ready) {
          ready = true;
          onReady();
        }
      } catch {
        onFailure();
      }
    };
    // Compile and draw the composer before publishing readiness; no hidden preloader.
    renderer
      .compileAsync(scene, camera)
      .then(() => {
        if (!cancelled) {
          composer.render(0);
          gsap.ticker.add(tick);
        }
      })
      .catch(() => {
        if (!cancelled) onFailure();
      });
    document.fonts.ready.then(() => {
      if (!cancelled) invalidate();
    });
    return () => {
      cancelled = true;
      gsap.ticker.remove(tick);
      morphTween?.kill();
      observer.disconnect();
      window.removeEventListener("resize", invalidate);
      coarse.removeEventListener("change", invalidate);
      page.removeEventListener("fluxora:layout-settled", invalidate);
      ScrollTrigger.removeEventListener("refresh", invalidate);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", lost);
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
      particles.geometry.dispose();
      particles.material.dispose();
      lines.geometry.dispose();
      lines.material.dispose();
      texture.dispose();
      renderPass.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      // React no longer delegates this canvas to R3F. Release its context too,
      // rather than waiting for GC after repeated pause/navigation cycles.
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [onFailure, onReady]);
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{
        display: "block",
        width: "100%",
        height: "100lvh",
        mixBlendMode: "screen",
      }}
    />
  );
}
