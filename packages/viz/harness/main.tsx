// Viz harness: develop and review the visualization against recorded traces, with no
// engine running (SPEC §6). `pnpm --filter @leettrace/viz harness`
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseTrace, type Trace } from '@leettrace/schema';
import { TraceViewer } from '../src';
import '../src/viz.css';

const files = import.meta.glob<{ default: unknown }>('../fixtures/*.json', { eager: true });
const fixtures: Record<string, Trace> = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [
    path.split('/').pop()!.replace('.json', ''),
    parseTrace(mod.default),
  ]),
);

function Harness() {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(params.get('fixture') ?? 'linked_list_reverse');
  const [theme, setTheme] = useState(params.get('theme') ?? 'light');
  const compact = params.has('compact');
  const step = Number(params.get('step') ?? 0);
  const trace = fixtures[name];
  document.body.style.background = theme === 'dark' ? '#0f1216' : '#fff';
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', maxWidth: compact ? 440 : 1280 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select aria-label="Fixture" value={name} onChange={(e) => setName(e.target.value)}>
          {Object.keys(fixtures).map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          theme: {theme}
        </button>
      </div>
      {trace && (
        <div data-theme={theme} className="lt-theme-host">
          <ThemedViewer key={name} trace={trace} theme={theme} compact={compact} step={step} />
        </div>
      )}
    </div>
  );
}

function ThemedViewer({
  trace,
  theme,
  compact,
  step,
}: {
  trace: Trace;
  theme: string;
  compact: boolean;
  step: number;
}) {
  return (
    <div ref={(el) => el?.querySelector('.lt-viz')?.setAttribute('data-theme', theme)}>
      <TraceViewer trace={trace} compact={compact} globalKeys initial={{ stepIndex: step }} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
