import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: string;
  id?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ eyebrow, id, title, description, meta, actions, className }: SectionHeaderProps) {
  return (
    <header className={["ui-section-header", className].filter(Boolean).join(" ")}>
      <div className="ui-section-header__content">
        {eyebrow ? <p className="ui-kicker">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {meta || actions ? <div className="ui-section-header__aside">{meta ? <span className="ui-section-header__meta">{meta}</span> : null}{actions ? <div className="ui-section-header__actions">{actions}</div> : null}</div> : null}
    </header>
  );
}
