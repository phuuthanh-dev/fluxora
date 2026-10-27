type FluxoraMarkProps = {
  size?: number;
  className?: string;
};

export function FluxoraMark({ size = 32, className }: FluxoraMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <rect fill="#d6ff32" height="64" rx="16" width="64" />
      <path d="M32 12.5 36.4 27.6 51.5 32l-15.1 4.4L32 51.5l-4.4-15.1L12.5 32l15.1-4.4L32 12.5Z" fill="#080a09" />
      <circle cx="32" cy="32" fill="#d6ff32" r="4.5" />
    </svg>
  );
}
