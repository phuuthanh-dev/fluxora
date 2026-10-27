"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

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

  const menuItems = () => Array.from(detailsRef.current?.querySelectorAll<HTMLElement>(
    '.ui-menu__content button:not([disabled]), .ui-menu__content [href], .ui-menu__content [tabindex]:not([tabindex="-1"])',
  ) ?? []);
  const focusItem = (edge: "first" | "last") => {
    window.requestAnimationFrame(() => {
      const items = menuItems();
      items[edge === "first" ? 0 : items.length - 1]?.focus();
    });
  };
  const closeAndRestoreFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
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
      setOpen(true);
      focusItem(event.key === "ArrowDown" ? "first" : "last");
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
      onToggle={(event) => setOpen(event.currentTarget.open)}
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
        onKeyDown={onTriggerKeyDown}
      >
        {trigger ?? <><span>{label}</span><ChevronDown size={14} aria-hidden="true" /></>}
      </summary>
      <div
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
      </div>
    </details>
  );
}
