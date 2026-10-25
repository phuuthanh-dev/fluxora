import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <section className={["ui-empty-state", className].filter(Boolean).join(" ")}>
      {icon ? <span className="ui-empty-state__icon" aria-hidden="true">{icon}</span> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </section>
  );
}
