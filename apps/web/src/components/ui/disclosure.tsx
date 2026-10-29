"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createDisclosureMotion } from "./ui-motion";

/** Native disclosure before hydration, interruptible GSAP height afterwards. */
export function Disclosure({ summary, children, className, defaultOpen = false, paused = false }: {
  summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean; paused?: boolean;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const initialOpen = useRef(defaultOpen);
  const id = useId();
  useLayoutEffect(() => {
    const details = root.current;
    if (!details) return;
    const trigger = details.querySelector("summary")!;
    const content = details.querySelector<HTMLElement>(".ui-disclosure__content")!;
    const inner = content.firstElementChild as HTMLElement;
    let desired = details.open;
    const motion = createDisclosureMotion(content, inner, desired, (visible) => { details.open = visible; }, paused);
    const toggle = (event: MouseEvent) => {
      event.preventDefault();
      desired = !desired;
      trigger.setAttribute("aria-expanded", String(desired));
      details.dataset.expanded = String(desired);
      motion.set(desired);
    };
    trigger.setAttribute("aria-expanded", String(desired));
    details.dataset.expanded = String(desired);
    trigger.addEventListener("click", toggle);
    return () => {
      trigger.removeEventListener("click", toggle);
      motion.destroy();
      trigger.removeAttribute("aria-expanded");
      delete details.dataset.expanded;
    };
  }, [paused]);
  return <details ref={root} open={initialOpen.current} className={["ui-disclosure", className].filter(Boolean).join(" ")}>
    <summary aria-controls={id}>{summary}</summary>
    <div id={id} className="ui-disclosure__content"><div className="ui-disclosure__inner">{children}</div></div>
  </details>;
}

/** Controlled variant for panels whose trigger lives elsewhere. */
export function Collapse({ open, children, id, className }: {
  open: boolean; children: ReactNode; id?: string; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const initialOpen = useRef(open);
  const controller = useRef<ReturnType<typeof createDisclosureMotion> | null>(null);
  useLayoutEffect(() => {
    const content = root.current!;
    controller.current = createDisclosureMotion(content, content.firstElementChild as HTMLElement, initialOpen.current,
      (visible) => { content.hidden = !visible; });
    return () => { controller.current?.destroy(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.set(open); }, [open]);
  return <div ref={root} id={id} hidden={!initialOpen.current} className="ui-collapse">
    <div className={["ui-disclosure__inner", className].filter(Boolean).join(" ")}>{children}</div>
  </div>;
}
