"use client";

import gsap from "gsap";
import { useLayoutEffect, type RefObject } from "react";

export const uiMotion = { fast: 0.18, standard: 0.28, disclosure: 0.32, ease: "power2.out" } as const;

/** Enhances a mounted surface without delaying focus or changing its layout. */
export function useSurfaceMotion(ref: RefObject<HTMLElement | null>, active = true, key: string | number = 0) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !active) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(element, { y: 6, opacity: 0.88 }, {
        y: 0, opacity: 1, duration: uiMotion.fast, ease: uiMotion.ease,
        clearProps: "transform,opacity",
      });
    }, element);
    return () => media.revert();
  }, [active, key, ref]);
}

export function usePointerTilt(ref: RefObject<HTMLElement | null>, paused = false) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || paused) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
      element.dataset.pointerDepth = "active";
      gsap.set(element, {
        transformPerspective: 1400,
        transformOrigin: "50% 50%",
        "--landing-depth-x": 0,
        "--landing-depth-y": 0,
      });
      const x = gsap.quickTo(element, "rotationX", { duration: 0.5, ease: "power3.out" });
      const y = gsap.quickTo(element, "rotationY", { duration: 0.5, ease: "power3.out" });
      const depthX = gsap.quickTo(element, "--landing-depth-x", { duration: 0.5, ease: "power3.out" });
      const depthY = gsap.quickTo(element, "--landing-depth-y", { duration: 0.5, ease: "power3.out" });
      const reset = () => { x(0); y(0); depthX(0); depthY(0); };
      const move = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        if (event.target instanceof Element && event.target.closest("button, a, input")) { reset(); return; }
        const bounds = element.getBoundingClientRect();
        const pointerX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
        const pointerY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
        y(pointerX * 8);
        x(pointerY * -7);
        depthX(pointerX);
        depthY(pointerY);
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerleave", reset);
      element.addEventListener("focusin", reset);
      return () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerleave", reset);
        element.removeEventListener("focusin", reset);
        delete element.dataset.pointerDepth;
      };
    }, element);
    return () => media.revert();
  }, [ref, paused]);
}

/** Height is intentional here: siblings must move without scaling the text. */
export function createDisclosureMotion(
  content: HTMLElement,
  inner: HTMLElement,
  initialOpen: boolean,
  setVisible: (visible: boolean) => void,
  disabled = false,
) {
  let desired = initialOpen;
  let tween: gsap.core.Tween | undefined;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const context = gsap.context(() => {}, content);
  const settle = () => {
    setVisible(desired);
    content.hidden = !desired;
    content.style.removeProperty("height");
    content.style.removeProperty("overflow");
    delete content.dataset.animating;
    content.dispatchEvent(new CustomEvent("fluxora:layout-settled", { bubbles: true }));
  };
  const set = (open: boolean, immediate = false) => {
    const from = content.hidden ? 0 : content.getBoundingClientRect().height;
    desired = open;
    tween?.kill();
    // Release recorded tweens on every reversal; long sessions stay bounded.
    context.revert();
    tween = undefined;
    content.inert = !open;
    content.setAttribute("aria-hidden", String(!open));
    if (immediate || disabled || media.matches) { settle(); return; }
    setVisible(true);
    content.hidden = false;
    const to = open ? inner.getBoundingClientRect().height : 0;
    if (Math.abs(from - to) < 0.5) { settle(); return; }
    content.dataset.animating = "true";
    context.add(() => {
      gsap.set(content, { height: from, overflow: "clip" });
      tween = gsap.to(content, { height: to, duration: uiMotion.disclosure, ease: uiMotion.ease, onComplete: settle });
    });
  };
  const preferenceChanged = () => set(desired, true);
  media.addEventListener("change", preferenceChanged);
  const observer = new ResizeObserver(() => {
    if (desired && tween?.isActive()) set(desired);
  });
  observer.observe(inner);
  set(initialOpen, true);
  return {
    set,
    destroy() {
      observer.disconnect();
      media.removeEventListener("change", preferenceChanged);
      tween?.kill();
      context.revert();
      settle();
      content.hidden = false;
      content.inert = false;
      content.removeAttribute("aria-hidden");
    },
  };
}
