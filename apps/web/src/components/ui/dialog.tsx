import type { ReactNode } from "react";

type DialogProps = {
  label: string;
  children: ReactNode;
  className?: string;
  modal?: boolean;
};

export function Dialog({ label, children, className, modal = true }: DialogProps) {
  return (
    <section className={["ui-dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal={modal} aria-label={label}>
      {children}
    </section>
  );
}
