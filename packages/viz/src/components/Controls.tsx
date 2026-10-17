import type { Step } from '@leettrace/schema';
import { SPEEDS, type Playback } from '../lib/usePlayback';

interface Props {
  playback: Playback;
  step: Step;
  total: number;
}

export function Controls({ playback: p, step, total }: Props) {
  const atStart = p.stepIndex === 0;
  const atEnd = p.stepIndex >= p.max;
  return (
    <div className="lt-controls" role="toolbar" aria-label="Playback controls">
      <div className="lt-buttons">
        <button
          type="button"
          onClick={p.first}
          disabled={atStart}
          aria-label="First step"
          title="First step (Home)"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={p.prev}
          disabled={atStart}
          aria-label="Step back"
          title="Step back (←)"
        >
          ◀
        </button>
        <button
          type="button"
          className="lt-play"
          onClick={p.toggle}
          aria-label={p.playing ? 'Pause' : 'Play'}
          aria-pressed={p.playing}
          title="Play / pause (Space)"
        >
          {p.playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          onClick={p.next}
          disabled={atEnd}
          aria-label="Step forward"
          title="Step forward (→)"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={p.last}
          disabled={atEnd}
          aria-label="Last step"
          title="Last step (End)"
        >
          ⏭
        </button>
      </div>
      <input
        className="lt-scrubber"
        type="range"
        min={0}
        max={p.max}
        value={p.stepIndex}
        onChange={(e) => p.goTo(Number(e.currentTarget.value))}
        aria-label="Timeline"
        aria-valuetext={`Step ${p.stepIndex + 1} of ${total}, line ${step.line}`}
      />
      <span className="lt-counter" aria-live="off">
        Step <strong>{p.stepIndex + 1}</strong>/{total} · line <strong>{step.line}</strong>
      </span>
      <label className="lt-speed">
        <span className="lt-sr">Speed (steps per second)</span>
        <select
          value={p.speed}
          onChange={(e) => p.setSpeed(Number(e.currentTarget.value))}
          aria-label="Speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×/s
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
