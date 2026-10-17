import { useId } from 'react';

/** The LeetTrace mark (focus brackets around a dot), drawn with the accent gradient tokens. */
export function BrandMark({
  className,
  size = 20,
  mono = false,
}: {
  className?: string;
  size?: number;
  /** Draw in currentColor (e.g. on top of the accent gradient). */
  mono?: boolean;
}) {
  const id = `ltg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const paint = mono ? 'currentColor' : `url(#${id})`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: 'var(--accent)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-2)' }} />
        </linearGradient>
      </defs>
      <path
        d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"
        stroke={paint}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke={paint} strokeWidth="2" />
    </svg>
  );
}
