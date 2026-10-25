import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type MenuProps = {
  label: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function Menu({ label, children, trigger, className, contentClassName }: MenuProps) {
  return (
    <details className={["ui-menu", className].filter(Boolean).join(" ")}>
      <summary className="ui-menu__trigger" aria-label={`${label} actions`}>
        {trigger ?? <><span>{label}</span><ChevronDown size={14} aria-hidden="true" /></>}
      </summary>
      <div
        className={["ui-menu__content", contentClassName].filter(Boolean).join(" ")}
        role="group"
        aria-label={`${label} menu`}
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("button")) {
            event.currentTarget.closest("details")?.removeAttribute("open");
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}
