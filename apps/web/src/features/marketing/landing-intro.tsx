"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";

/** Relay's ring → inward flood → square/tile fold, with bounded fail-open loading. */
export function LandingIntro({ onComplete }: { onComplete: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const skip = useRef(() => {});
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const main = document.querySelector<HTMLElement>(".landing-page");
    const previousInert = main?.inert ?? false;
    const previousOverflow = document.documentElement.style.overflow;
    const ring = host.querySelector<SVGRectElement>("rect[data-loader-ring]")!;
    const flood = host.querySelector<HTMLElement>(".landing-loader__flood")!;
    const plate = host.querySelector<HTMLElement>(".landing-loader__plate")!;
    const mark = host.querySelector<HTMLElement>(".landing-loader__mark")!;
    const number = host.querySelector<HTMLElement>("output")!;
    let disposed = false,
      finished = false,
      closing = false;
    const abort = new AbortController();
    const progress = { value: 4 };
    let progressTween: gsap.core.Tween | undefined;
    let closingTimeline: gsap.core.Timeline | undefined;
    const restore = () => {
      host.hidden = true;
      if (main) main.inert = previousInert;
      document.documentElement.style.overflow = previousOverflow;
    };
    const release = () => {
      if (disposed || finished) return;
      finished = true;
      progressTween?.kill();
      closingTimeline?.kill();
      restore();
      onComplete();
    };
    skip.current = release;
    if (
      reduced.matches ||
      scrollY > 48 ||
      (location.hash && location.hash !== "#top")
    ) {
      release();
      return;
    }
    host.hidden = false;
    host.dataset.phase = "draw";
    if (main) main.inert = true;
    document.documentElement.style.overflow = "hidden";
    const fold = { value: 0 };
    const paintFold = () => {
      const w = innerWidth,
        h = innerHeight;
      const half = ((1 - fold.value) * Math.max(w, h)) / 2;
      const hw = Math.min(half, w / 2),
        hh = Math.min(half, h / 2);
      const side = Math.min(hw, hh) * 2;
      const difference = Math.abs(w - h) / 2;
      const squared = difference
        ? Math.min(1, (Math.max(w, h) / 2 - half) / difference)
        : 1;
      plate.style.clipPath = `inset(${h / 2 - hh}px ${w / 2 - hw}px round ${side * (24 / 76) * squared}px)`;
      mark.style.clipPath =
        side >= 76
          ? "none"
          : `inset(${(76 - side) / 2}px round ${side * (24 / 76)}px)`;
    };
    const close = () => {
      if (closing || disposed || finished) return;
      closing = true;
      // Restore the scrollbar while the intro still covers the page, so its
      // appearance does not coincide with revealing the landing content.
      document.documentElement.style.overflow = previousOverflow;
      host.dataset.phase = "flood";
      closingTimeline = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      closingTimeline
        .to(flood, {
          boxShadow: `inset 0 0 0 ${Math.ceil(Math.max(innerWidth, innerHeight) / 2) + 2}px #c8f751`,
          duration: 0.48,
        })
        .call(() => {
          host.dataset.phase = "fold";
          paintFold();
        })
        .to(fold, { value: 1, duration: 1, onUpdate: paintFold })
        .call(release);
    };
    let target = 4;
    const advance = (value: number) => {
      if (disposed || finished || closing) return;
      target = Math.max(target, value);
      progressTween?.kill();
      progressTween = gsap.to(progress, {
        value: target,
        duration: 0.45,
        ease: "power2.out",
        onUpdate: () => {
          ring.style.strokeDashoffset = String(100 - progress.value);
          number.textContent = `${Math.round(progress.value)}%`;
          host
            .querySelector('[role="progressbar"]')
            ?.setAttribute("aria-valuenow", String(Math.round(progress.value)));
        },
        onComplete: () => {
          if (target === 100) close();
        },
      });
    };
    const images = [...document.images].filter(
      (image) => image.loading !== "lazy",
    );
    // The hero bloom is a CSS background; include it in actual readiness too.
    const bloom = new Image();
    bloom.src = "/relay/hero/hero-window-bloom.webp";
    images.push(bloom);
    let settled = 0;
    const done = () => {
      settled++;
      advance(
        settled === images.length + 1
          ? 100
          : 4 + (76 * settled) / (images.length + 1),
      );
    };
    for (const image of images) {
      if (image.complete) done();
      else {
        image.addEventListener("load", done, {
          once: true,
          signal: abort.signal,
        });
        image.addEventListener("error", done, {
          once: true,
          signal: abort.signal,
        });
      }
    }
    void document.fonts.ready.then(done, done);
    const loadingDeadline = setTimeout(() => advance(100), 4000);
    const safetyDeadline = setTimeout(release, 6000);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") release();
    };
    const preference = () => {
      if (reduced.matches) release();
    };
    window.addEventListener("keydown", escape);
    reduced.addEventListener("change", preference);
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(loadingDeadline);
      clearTimeout(safetyDeadline);
      progressTween?.kill();
      closingTimeline?.kill();
      window.removeEventListener("keydown", escape);
      reduced.removeEventListener("change", preference);
      restore();
    };
  }, [onComplete]);
  return (
    <>
      <div ref={root} className="landing-loader" data-phase="draw">
        <div className="landing-loader__stage" />
        <svg
          className="landing-loader__ring"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <rect
            data-loader-ring
            x="8"
            y="8"
            width="100%"
            height="100%"
            style={{
              width: "calc(100% - 16px)",
              height: "calc(100% - 16px)",
            }}
            rx="24"
            pathLength="100"
          />
        </svg>
        <div className="landing-loader__flood" />
        <div className="landing-loader__plate" />
        <span className="landing-loader__mark">
          <FluxoraMark size={76} />
        </span>
        <div
          className="landing-loader__status"
          role="progressbar"
          aria-label="Loading Fluxora"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={4}
        >
          <span>PREPARING FLUXORA</span>
          <output aria-hidden="true">4%</output>
        </div>
        <button
          className="landing-loader__skip"
          onClick={() => {
            // Dismiss synchronously as well as stopping the timeline. This is
            // intentionally fail-open if a browser is between flood/fold frames.
            root.current!.hidden = true;
            skip.current();
          }}
        >
          Skip intro
        </button>
      </div>
      <noscript>
        <style>{`.landing-loader{display:none!important}.landing-page{visibility:visible!important}`}</style>
      </noscript>
    </>
  );
}
