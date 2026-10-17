import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { isCompatibleEngine, SCHEMA_VERSION, type Trace } from '@leettrace/schema';
import { diffSteps } from '../lib/diff';
import { computeLayout } from '../lib/layout';
import { usePlayback, type Playback, type PlaybackState } from '../lib/usePlayback';
import { useReducedMotion } from '../lib/useReducedMotion';
import { ArrowLayer } from './ArrowLayer';
import { Controls } from './Controls';
import { HeapPanel } from './HeapPanel';
import { NarrationBar } from './NarrationBar';
import { OutputPane } from './OutputPane';
import { SourceView } from './SourceView';
import { StackPanel } from './StackPanel';
import { TestResultBadge } from './TestResultBadge';

export interface TraceViewerProps {
  trace: Trace;
  /** Narrow, stacked layout for side panels. */
  compact?: boolean;
  /** Listen for ←/→/Space on the whole window (ignored while typing in inputs). */
  globalKeys?: boolean;
  initial?: Partial<PlaybackState>;
  /** Exposes the playback controller (e.g. for exporting or tests). */
  onPlayback?: (p: Playback) => void;
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
    !!t.closest('.monaco-editor, .cm-editor')
  );
}

export function handleKey(p: Playback, key: string): boolean {
  switch (key) {
    case 'ArrowRight':
      p.next();
      return true;
    case 'ArrowLeft':
      p.prev();
      return true;
    case ' ':
      p.toggle();
      return true;
    case 'Home':
      p.first();
      return true;
    case 'End':
      p.last();
      return true;
    default:
      return false;
  }
}

export function TraceViewer({ trace, compact, globalKeys, initial, onPlayback }: TraceViewerProps) {
  const playback = usePlayback(trace, initial);
  const reducedMotion = useReducedMotion();
  const layout = useMemo(() => computeLayout(trace), [trace]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const steps = trace.steps;
  const step = steps[playback.stepIndex];
  const prevStep = playback.stepIndex > 0 ? steps[playback.stepIndex - 1] : undefined;
  const diff = useMemo(() => (step ? diffSteps(prevStep, step) : null), [prevStep, step]);
  const hot = useMemo(() => new Set([...(diff?.locals ?? []), ...(diff?.slots ?? [])]), [diff]);

  useEffect(() => {
    onPlayback?.(playback);
  }, [onPlayback, playback]);

  useEffect(() => {
    if (!globalKeys) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      if (e.target instanceof HTMLButtonElement && e.key === ' ') return; // let buttons click
      if (handleKey(playback, e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [globalKeys, playback]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (globalKeys || isEditable(e.target)) return;
    if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
    if (handleKey(playback, e.key)) e.preventDefault();
  };

  const compatible = isCompatibleEngine(trace.engineVersion);
  const cls = `lt-viz${compact ? ' lt-compact' : ''}${reducedMotion ? ' lt-reduced-motion' : ''}`;

  return (
    <div
      className={cls}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="region"
      aria-label="Trace visualization"
    >
      {!compatible && (
        <div className="lt-banner lt-banner-warn" role="alert">
          This trace came from engine v{trace.engineVersion}, but this viewer expects v
          {SCHEMA_VERSION}. Update LeetTrace (engine and extension) so they match.
        </div>
      )}
      {trace.test && <TestResultBadge test={trace.test} />}
      {trace.error && (
        <div className="lt-banner lt-banner-error" role="alert">
          <strong>{trace.error.type}</strong>
          {trace.error.line ? ` on line ${trace.error.line}` : ''}: {trace.error.message}
        </div>
      )}
      {trace.truncated && !trace.error && (
        <div className="lt-banner lt-banner-warn" role="status">
          Trace truncated at {steps.length.toLocaleString()} steps — showing the run up to the cap.
        </div>
      )}
      {!step || !diff ? (
        <p className="lt-empty lt-empty-big">This trace has no steps to show.</p>
      ) : (
        <>
          <NarrationBar step={step} />
          <Controls playback={playback} step={step} total={steps.length} />
          <div className="lt-body">
            <SourceView source={trace.source} line={step.line} errorLine={trace.error?.line} />
            <div className="lt-canvas" ref={canvasRef}>
              <StackPanel step={step} diff={diff} />
              <HeapPanel step={step} layout={layout} diff={diff} />
              <ArrowLayer
                canvasRef={canvasRef}
                stepKey={playback.stepIndex}
                hot={hot}
                reducedMotion={reducedMotion}
              />
            </div>
          </div>
          <OutputPane step={step} />
        </>
      )}
    </div>
  );
}
