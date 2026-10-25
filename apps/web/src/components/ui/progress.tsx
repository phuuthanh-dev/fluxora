type ProgressProps = {
  label: string;
  value?: number;
  className?: string;
};

export function Progress({ label, value, className }: ProgressProps) {
  const determinate = typeof value === "number";
  const normalized = determinate ? Math.max(0, Math.min(100, value)) : undefined;
  return (
    <div className={["ui-progress", className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <span>{label}</span>
      <span className="ui-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized}>
        <span className="ui-progress__value" style={determinate ? { width: `${normalized}%` } : undefined} />
      </span>
    </div>
  );
}
