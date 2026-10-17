// Viz harness: develop and review the visualization against recorded traces, with no
// engine running (SPEC §6). `pnpm --filter @leettrace/viz harness`
// URL params: ?fixture=<name>&theme=dark|light&compact&step=<n>
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseTrace, type Trace } from '@leettrace/schema';
import { TraceViewer } from '../src';
import '@leettrace/design/fonts.css';
import '@leettrace/design/components.css';
import '../src/viz.css';
import './harness.css';

const files = import.meta.glob<{ default: unknown }>('../fixtures/*.json', { eager: true });
const fixtures: Record<string, Trace> = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [
    path.split('/').pop()!.replace('.json', ''),
    parseTrace(mod.default),
  ]),
);

type Theme = 'dark' | 'light';

function Harness() {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(params.get('fixture') ?? 'linked_list_reverse');
  const [theme, setTheme] = useState<Theme>(params.get('theme') === 'light' ? 'light' : 'dark');
  const compact = params.has('compact');
  const step = Number(params.get('step') ?? 0);
  const trace = fixtures[name];
  document.documentElement.dataset.theme = theme;
  return (
    <div className={`harness${compact ? ' harness-compact' : ''}`}>
      <div className="harness-bar">
        <strong className="harness-brand">
          Leet<span>Trace</span> · viz harness
        </strong>
        <select
          className="ds-pill"
          aria-label="Fixture"
          value={name}
          onChange={(e) => setName(e.target.value)}
        >
          {Object.keys(fixtures).map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button
          type="button"
          className="ds-btn ds-btn-ghost ds-btn-sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          theme: {theme}
        </button>
      </div>
      {trace && (
        <TraceViewer
          key={name}
          trace={trace}
          theme={theme}
          compact={compact}
          globalKeys
          initial={{ stepIndex: step }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
