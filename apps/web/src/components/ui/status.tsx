import type { HTMLAttributes, ReactNode } from "react";

export type StatusTone = "info" | "success" | "warning" | "error";

type StatusProps = HTMLAttributes<HTMLElement> & {
  tone?: StatusTone;
  children: ReactNode;
};

export function Status({ tone = "info", className, role, children, ...props }: StatusProps) {
  return (
    <section {...props} className={["ui-status", `ui-status--${tone}`, className].filter(Boolean).join(" ")} role={role ?? (tone === "error" ? "alert" : "status")}>
      {children}
    </section>
  );
}
