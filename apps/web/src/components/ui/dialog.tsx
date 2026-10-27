"use client";

import type { ReactNode } from "react";
import { useDialogFocus } from "./use-dialog-focus";

type DialogProps = {
  label: string;
  children: ReactNode;
  className?: string;
  modal?: boolean;
  onClose?: () => void;
  initialFocusSelector?: string;
  restoreFocus?: boolean;
};

export function Dialog({ label, children, className, modal = true, onClose, initialFocusSelector, restoreFocus = true }: DialogProps) {
  const dialogRef = useDialogFocus<HTMLElement>({
    trapFocus: modal,
    onClose,
    initialFocusSelector,
    restoreFocus,
  });
  return (
    <section ref={dialogRef} className={["ui-dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal={modal} aria-label={label} tabIndex={-1}>
      {children}
    </section>
  );
}
