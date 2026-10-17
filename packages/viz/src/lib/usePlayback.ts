import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Trace } from '@leettrace/schema';

export interface PlaybackState {
  stepIndex: number;
  playing: boolean;
  speed: number; // steps per second
}

type Action =
  | { type: 'goTo'; i: number; max: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; max: number }
  | { type: 'speed'; speed: number }
  | { type: 'reset'; at: number };

function clamp(i: number, max: number): number {
  return Math.max(0, Math.min(max, i));
}

export function playbackReducer(s: PlaybackState, a: Action): PlaybackState {
  switch (a.type) {
    case 'goTo':
      return { ...s, stepIndex: clamp(a.i, a.max) };
    case 'play':
      return { ...s, playing: true };
    case 'pause':
      return { ...s, playing: false };
    case 'tick':
      if (s.stepIndex >= a.max) return { ...s, playing: false };
      return { ...s, stepIndex: s.stepIndex + 1 };
    case 'speed':
      return { ...s, speed: a.speed };
    case 'reset':
      return { ...s, stepIndex: a.at, playing: false };
  }
}

export const SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;

export interface Playback extends PlaybackState {
  max: number;
  goTo(i: number): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(n: number): void;
}

/**
 * Playback over a trace. The view renders `trace.steps[stepIndex]` and nothing else, so
 * step-back and scrubbing are exact by construction.
 */
export function usePlayback(trace: Trace, initial?: Partial<PlaybackState>): Playback {
  const max = Math.max(0, trace.steps.length - 1);
  const [state, dispatch] = useReducer(playbackReducer, {
    stepIndex: clamp(initial?.stepIndex ?? 0, max),
    playing: initial?.playing ?? false,
    speed: initial?.speed ?? 2,
  });

  // A *new* trace (e.g. a watch-mode re-trace) restarts at the first step.
  const seen = useRef(trace);
  useEffect(() => {
    if (seen.current === trace) return;
    seen.current = trace;
    dispatch({ type: 'reset', at: 0 });
  }, [trace]);

  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => dispatch({ type: 'tick', max }), 1000 / state.speed);
    return () => window.clearInterval(id);
  }, [state.playing, state.speed, max]);

  const goTo = useCallback((i: number) => dispatch({ type: 'goTo', i, max }), [max]);
  return useMemo(
    () => ({
      ...state,
      max,
      goTo,
      next: () => goTo(state.stepIndex + 1),
      prev: () => goTo(state.stepIndex - 1),
      first: () => goTo(0),
      last: () => goTo(max),
      play: () => {
        if (state.stepIndex >= max) goTo(0);
        dispatch({ type: 'play' });
      },
      pause: () => dispatch({ type: 'pause' }),
      toggle: () => {
        if (state.playing) dispatch({ type: 'pause' });
        else {
          if (state.stepIndex >= max) goTo(0);
          dispatch({ type: 'play' });
        }
      },
      setSpeed: (n: number) => dispatch({ type: 'speed', speed: n }),
    }),
    [state, max, goTo],
  );
}
