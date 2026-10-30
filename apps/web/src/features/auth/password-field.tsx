"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { IconButton } from "../../components/ui";

export function PasswordField({ label, value, onChange, current = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; current?: boolean; disabled?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label className="auth-field__label" htmlFor={id}>{label}</label>
    <div className="auth-password">
      <input id={id} type={visible ? "text" : "password"} autoComplete={current ? "current-password" : "new-password"} minLength={current ? 1 : 12} maxLength={128} required value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />
      <IconButton label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible} disabled={disabled} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</IconButton>
    </div>
  </div>;
}
