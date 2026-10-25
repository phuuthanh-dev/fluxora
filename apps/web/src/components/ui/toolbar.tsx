import type { HTMLAttributes, ReactNode } from "react";

type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  children: ReactNode;
};

export function Toolbar({ label, children, className, ...props }: ToolbarProps) {
  return <div {...props} className={["ui-toolbar", className].filter(Boolean).join(" ")} role="group" aria-label={label}>{children}</div>;
}
