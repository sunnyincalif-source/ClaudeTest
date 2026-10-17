// The payoff: the real LeetTrace panel (packages/viz), playing a recorded trace of a linked
// list being reversed, on a loop. Loaded lazily when it scrolls near (keeps the hero fast).
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseTrace } from '@leettrace/schema';
import { TraceViewer, type Playback } from '@leettrace/viz';
import '@leettrace/viz/viz.css';
import fixture from '@leettrace/viz/fixtures/linked_list_reverse.json';
import { usePrefersReducedMotion } from './components';

const trace = parseTrace(fixture);
// Start where the reversal loop begins, so the first thing you see is pointers moving.
const LOOP_START = Math.max(
  0,
  trace.steps.findIndex((s) => s.line >= 11),
);

export default function LivePanel({ compact }: { compact: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pb = useRef<Playback | null>(null);
  // Once the visitor touches the controls, autoplay stops for good (WCAG 2.2.2).
  const [takenOver, setTakenOver] = useState(false);
  const onPlayback = useCallback((p: Playback) => {
    pb.current = p;
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Autoplay only while on screen and without reduced motion; loop back at the end.
  useEffect(() => {
    if (reduced || !visible || takenOver) {
      if (takenOver) return;
      pb.current?.pause();
      return;
    }
    const id = window.setInterval(() => {
      const p = pb.current;
      if (!p) return;
      if (p.stepIndex >= p.max) {
        p.goTo(LOOP_START);
        p.play();
      } else if (!p.playing) p.play();
    }, 1200);
    return () => window.clearInterval(id);
  }, [visible, reduced, takenOver]);

  return (
    <div
      ref={wrap}
      className="live-panel"
      onPointerDown={() => setTakenOver(true)}
      onKeyDown={() => setTakenOver(true)}
    >
      <TraceViewer
        trace={trace}
        theme="dark"
        compact={compact}
        initial={{ stepIndex: LOOP_START, speed: 2 }}
        onPlayback={onPlayback}
      />
    </div>
  );
}
