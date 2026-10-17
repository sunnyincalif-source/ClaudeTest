import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The LeetTrace mark: a magnifier inside code brackets. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <rect width="32" height="32" rx="8" className="mark-bg" />
      <path
        d="M9 8H6.5v16H9M23 8h2.5v16H23"
        className="mark-stroke"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="15" r="4.6" className="mark-stroke" fill="none" strokeWidth="2.2" />
      <path
        d="M18.4 18.4l3.2 3.2"
        className="mark-stroke"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
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

/**
 * A looping product clip. Autoplays (muted) only while on screen and only without
 * prefers-reduced-motion; always has a visible pause/play control (WCAG 2.2.2).
 */
export function DemoVideo({
  name,
  label,
  eager = false,
  width = 960,
  height = 516,
}: {
  name: string;
  label: string;
  eager?: boolean;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || reduced || userPaused || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduced, userPaused]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      setUserPaused(false);
      void v.play().catch(() => undefined);
    } else {
      setUserPaused(true);
      v.pause();
    }
  };

  return (
    <div className="video">
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload={eager ? 'metadata' : 'none'}
        poster={`/media/${name}.webp`}
        width={width}
        height={height}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        <source src={`/media/${name}.webm`} type="video/webm" />
        <source src={`/media/${name}.mp4`} type="video/mp4" />
      </video>
      <button
        type="button"
        className="video-toggle"
        onClick={toggle}
        aria-label={playing ? `Pause: ${label}` : `Play: ${label}`}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** A browser/mac window frame around product visuals. */
export function WindowFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="window">
      <div className="window-bar" aria-hidden="true">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="window-title">{title}</span>
      </div>
      <div className="window-body">{children}</div>
    </figure>
  );
}

/** Adds .in to children of `.reveal` when scrolled into view. Content is visible regardless. */
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
