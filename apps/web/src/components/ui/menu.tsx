"use client";

import { ChevronDown } from "lucide-react";
import { flushSync } from "react-dom";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSurfaceMotion } from "./ui-motion";

type MenuProps = {
  label: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function Menu({ label, children, trigger, className, contentClassName }: MenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useSurfaceMotion(contentRef, open);

  const menuItems = () => Array.from(detailsRef.current?.querySelectorAll<HTMLElement>(
    '.ui-menu__content button:not([disabled]), .ui-menu__content [href], .ui-menu__content [tabindex]:not([tabindex="-1"])',
  ) ?? []);
  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const edge = event.key === "ArrowDown" ? "first" : "last";
      flushSync(() => setOpen(true));
      const items = menuItems();
      items[edge === "first" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closeAndRestoreFocus();
    }
  };

  const onContentKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = menuItems();
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <details
      ref={detailsRef}
      open={open}
      className={["ui-menu", className].filter(Boolean).join(" ")}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <summary
        ref={triggerRef}
        className="ui-menu__trigger"
        aria-label={`${label} actions`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger ?? <><span>{label}</span><ChevronDown size={14} aria-hidden="true" /></>}
      </summary>
      {open && <div
        ref={contentRef}
        id={contentId}
        className={["ui-menu__content", contentClassName].filter(Boolean).join(" ")}
        role="menu"
        aria-label={`${label} menu`}
        onKeyDown={onContentKeyDown}
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("button")) {
            closeAndRestoreFocus();
          }
        }}
      >
        {children}
      </div>}
    </details>
  );
}
