import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return <select {...props} className={["ui-select", className].filter(Boolean).join(" ")} />;
}
