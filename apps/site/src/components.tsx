import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The LeetTrace mark: focus brackets around a dot, in the blue→cyan accent gradient. */
export function Mark({ size = 24, id = 'mark' }: { size?: number; id?: string }) {
  const g = `lt-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: 'var(--accent)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-2)' }} />
        </linearGradient>
      </defs>
      <path
        d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"
        stroke={`url(#${g})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke={`url(#${g})`} strokeWidth="2" />
    </svg>
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** True once the element has come near the viewport (then stays true). */
export function useNearViewport<T extends Element>(
  margin = '300px',
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near];
}

/** A window frame around product visuals (design system ds-frame). */
export function WindowFrame({
  address,
  children,
  label,
}: {
  address: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <figure className="ds-frame frame" aria-label={label}>
      <div className="ds-frame-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span className="ds-frame-addr">{address}</span>
      </div>
      <div className="frame-body">{children}</div>
    </figure>
  );
}

/** Adds .in to `.reveal` elements when scrolled into view. Content is visible regardless. */
export function useReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('reveal-on');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}
