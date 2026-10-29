"use client";

import type { ReactNode } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { useSurfaceMotion } from "./ui-motion";
import { X } from "lucide-react";
import { IconButton } from "./button";

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
  useSurfaceMotion(dialogRef);
  return (
    <section ref={dialogRef} className={["ui-dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal={modal} aria-label={label} tabIndex={-1}>
      {children}
    </section>
  );
}

export function DialogHeader({ title, eyebrow, onClose, closeLabel = "Close dialog" }: {
  title: ReactNode; eyebrow?: string; onClose?: () => void; closeLabel?: string;
}) {
  return <header className="ui-dialog-header">
    <div>{eyebrow && <p className="section-label">{eyebrow}</p>}<h2>{title}</h2></div>
    {onClose && <IconButton label={closeLabel} onClick={onClose}><X size={17} /></IconButton>}
  </header>;
}
