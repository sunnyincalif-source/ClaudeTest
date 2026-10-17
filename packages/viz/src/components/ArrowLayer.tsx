// The pointer arrows (SPEC §6).
//
// After each render, measure every ref source anchor ([data-ref-source]) and every heap
// card ([data-heap-id]) relative to the canvas, and draw an SVG cubic bezier per edge.
// Geometry is a pure function of the rendered DOM, which is a pure function of the step.
// The only extra state is a short visual tween keyed by the *source* (e.g. "o2:next"), so a
// repointed `next` slides from its old target to its new one instead of jumping.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

type Geom = [number, number, number, number, number, number, number, number];

interface Edge {
  key: string; // source key: stable across steps for the same variable/field
  target: string;
  geom: Geom;
  self: boolean;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface Props {
  canvasRef: RefObject<HTMLElement | null>;
  /** Changes whenever the rendered step changes (triggers re-measure). */
  stepKey: string | number;
  hot: ReadonlySet<string>;
  reducedMotion: boolean;
}

const TWEEN_MS = 280;

function relRect(el: Element, origin: DOMRect, canvas: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const left = r.left - origin.left + canvas.scrollLeft;
  const top = r.top - origin.top + canvas.scrollTop;
  return {
    left,
    top,
    right: left + r.width,
    bottom: top + r.height,
    width: r.width,
    height: r.height,
  };
}

export function edgeGeometry(src: Rect, dst: Rect, self: boolean): Geom {
  const sx = src.left + src.width / 2;
  const sy = src.top + src.height / 2;
  if (self) {
    // Loop out of the pill and back into the card's top-right corner.
    const ex = dst.right - 14;
    const ey = dst.top;
    return [sx, sy, sx + 64, sy, ex + 40, ey - 46, ex, ey];
  }
  const dcx = dst.left + dst.width / 2;
  const dcy = dst.top + dst.height / 2;
  if (dst.left >= sx + 12) {
    // Target to the right: a horizontal "cable" into the card's left edge.
    const ex = dst.left;
    const ey = Math.min(Math.max(sy, dst.top + 14), dst.bottom - 14);
    const dx = Math.max(30, (ex - sx) * 0.45);
    return [sx, sy, sx + dx, sy, ex - dx, ey, ex, ey];
  }
  if (dst.top > sy + 8) {
    // Target below (tree children, list items → nodes): drop into the top edge.
    const ex = Math.min(Math.max(sx, dst.left + 16), dst.right - 16);
    const ey = dst.top;
    const dy = Math.max(26, (ey - sy) * 0.5);
    return [sx, sy, sx, sy + dy, ex, ey - dy, ex, ey];
  }
  if (dst.bottom < sy - 8) {
    // Target above: rise into the bottom edge.
    const ex = Math.min(Math.max(dcx, dst.left + 16), dst.right - 16);
    const ey = dst.bottom;
    const dy = Math.max(26, (sy - ey) * 0.5);
    return [sx, sy, sx + 30, sy - dy, ex, ey + dy, ex, ey];
  }
  // Target to the left on the same row (e.g. a reversed `next`): arc over the top.
  const ex = dcx;
  const ey = dst.top;
  const lift = Math.max(42, Math.abs(sx - ex) * 0.22);
  void dcy;
  return [sx, sy, sx + 26, sy - lift, ex + 10, ey - lift, ex, ey];
}

function pathD(g: Geom): string {
  const f = (n: number) => n.toFixed(1);
  return `M${f(g[0])},${f(g[1])} C${f(g[2])},${f(g[3])} ${f(g[4])},${f(g[5])} ${f(g[6])},${f(g[7])}`;
}

function lerp(a: Geom, b: Geom, t: number): Geom {
  return a.map((v, i) => v + (b[i]! - v) * t) as Geom;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function ArrowLayer({ canvasRef, stepKey, hot, reducedMotion }: Props) {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const paths = useRef(new Map<string, SVGPathElement>());
  const shown = useRef(new Map<string, Geom>()); // geometry currently on screen
  const frame = useRef(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const origin = canvas.getBoundingClientRect();
    const cards = new Map<string, Rect>();
    canvas.querySelectorAll<HTMLElement>('[data-heap-id]').forEach((el) => {
      cards.set(el.dataset.heapId!, relRect(el, origin, canvas));
    });
    const next: Edge[] = [];
    canvas.querySelectorAll<HTMLElement>('[data-ref-source]').forEach((el) => {
      const target = el.dataset.refTarget;
      const key = el.dataset.refSource!;
      if (!target) return;
      const dst = cards.get(target);
      if (!dst) return;
      const owner = el.closest<HTMLElement>('[data-heap-id]')?.dataset.heapId;
      const self = owner === target;
      next.push({ key, target, self, geom: edgeGeometry(relRect(el, origin, canvas), dst, self) });
    });
    setEdges(next);
    setSize({ w: canvas.scrollWidth, h: canvas.scrollHeight });
  }, [canvasRef]);

  // Re-measure after every step render.
  useLayoutEffect(() => {
    measure();
  }, [measure, stepKey]);

  // ...and on resize, nested scroll, and font load (rAF-throttled).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(canvas);
    for (const child of Array.from(canvas.children)) ro?.observe(child);
    window.addEventListener('resize', schedule);
    canvas.addEventListener('scroll', schedule, true);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
      canvas.removeEventListener('scroll', schedule, true);
    };
  }, [canvasRef, measure]);

  // Tween from what's on screen to the new geometry, per source key.
  useLayoutEffect(() => {
    cancelAnimationFrame(frame.current);
    const from = new Map(shown.current);
    const targets = new Map(edges.map((e) => [e.key, e.geom]));
    const apply = (t: number) => {
      for (const [key, to] of targets) {
        const start = from.get(key) ?? to;
        const g = t >= 1 ? to : lerp(start, to, ease(t));
        shown.current.set(key, g);
        paths.current.get(key)?.setAttribute('d', pathD(g));
      }
    };
    for (const key of [...shown.current.keys()]) if (!targets.has(key)) shown.current.delete(key);
    const needsTween =
      !reducedMotion &&
      [...targets].some(
        ([k, g]) => from.has(k) && from.get(k)!.some((v, i) => Math.abs(v - g[i]!) > 0.5),
      );
    if (!needsTween) {
      apply(1);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / TWEEN_MS);
      apply(t);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    apply(0);
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [edges, reducedMotion]);

  return (
    <svg
      className="lt-arrows"
      width={size.w}
      height={size.h}
      aria-hidden="true"
      data-edge-count={edges.length}
    >
      <defs>
        <marker
          id={`${uid}-head`}
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="lt-arrow-head" />
        </marker>
        <marker
          id={`${uid}-hot`}
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="lt-arrow-head lt-arrow-head-hot" />
        </marker>
      </defs>
      {edges.map((e) => {
        const isHot = hot.has(e.key);
        return (
          <path
            key={e.key}
            data-edge={`${e.key}->${e.target}`}
            ref={(el) => {
              if (el) paths.current.set(e.key, el);
              else paths.current.delete(e.key);
            }}
            d={pathD(shown.current.get(e.key) ?? e.geom)}
            className={`lt-arrow${isHot ? ' lt-arrow-hot' : ''}${e.self ? ' lt-arrow-self' : ''}`}
            markerEnd={isHot ? `url(#${uid}-hot)` : `url(#${uid}-head)`}
          />
        );
      })}
    </svg>
  );
}
