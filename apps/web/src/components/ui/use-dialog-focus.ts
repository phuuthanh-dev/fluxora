"use client";

import { useEffect, useRef } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

type DialogFocusOptions = {
  active?: boolean;
  trapFocus?: boolean;
  onClose?: () => void;
  restoreFocus?: boolean;
  initialFocusSelector?: string;
};

export function useDialogFocus<T extends HTMLElement>({
  active = true,
  trapFocus = true,
  onClose,
  restoreFocus = true,
  initialFocusSelector,
}: DialogFocusOptions = {}) {
  const scopeRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const scope = scopeRef.current;
    if (!scope) return;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () => Array.from(scope.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getAttribute("aria-hidden") !== "true");
    const frame = window.requestAnimationFrame(() => {
      const preferred = initialFocusSelector
        ? scope.querySelector<HTMLElement>(initialFocusSelector)
        : scope.querySelector<HTMLElement>("[autofocus]");
      (preferred ?? focusableElements()[0] ?? scope).focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !trapFocus) return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        scope.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!scope.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    scope.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      scope.removeEventListener("keydown", handleKeyDown);
      if (restoreFocus && returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus());
      }
    };
  }, [active, initialFocusSelector, restoreFocus, trapFocus]);

  return scopeRef;
}
