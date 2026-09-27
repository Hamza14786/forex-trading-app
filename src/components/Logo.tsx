export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Polygon">
        <rect width="32" height="32" rx="9" fill="var(--primary)" />
        <path
          d="M8 22V10m0 12 7-7 4 4 5-8"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-display text-base font-semibold tracking-tight">Polygon</span>
    </span>
  );
}
