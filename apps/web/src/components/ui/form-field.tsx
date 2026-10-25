import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

export function Field({ label, children, hint, error, className }: FieldProps) {
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")}>
      <span className="ui-field__label">{label}</span>
      {children}
      {hint && <p className="ui-field__hint">{hint}</p>}
      {error && <p className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
}
