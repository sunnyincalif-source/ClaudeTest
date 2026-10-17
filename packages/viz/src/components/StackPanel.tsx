import type { Frame, Step } from '@leettrace/schema';
import type { StepDiff } from '../lib/diff';
import { ValuePill } from './ValuePill';

interface Props {
  step: Step;
  diff: StepDiff;
}

function frameTitle(f: Frame): string {
  return f.func === '<module>' ? 'Global frame' : `${f.func}()`;
}

export function StackPanel({ step, diff }: Props) {
  const frames = [...step.stack].reverse(); // newest on top
  return (
    <section className="lt-stack" aria-label="Call stack">
      <h2 className="lt-panel-title">Call stack</h2>
      {frames.length === 0 && <p className="lt-empty">No frames.</p>}
      <ol className="lt-frames">
        {frames.map((f, idx) => (
          <li
            key={f.id}
            className={`lt-frame${idx === 0 ? ' lt-frame-top' : ''}`}
            aria-current={idx === 0 ? 'true' : undefined}
          >
            <div className="lt-frame-head">
              <span className="lt-frame-name">{frameTitle(f)}</span>
              {idx === 0 && <span className="lt-chip">active</span>}
            </div>
            {f.order.length === 0 && f.returnValue === undefined && (
              <div className="lt-empty lt-empty-sm">no variables yet</div>
            )}
            <dl className="lt-vars">
              {f.order.map((name) => {
                const v = f.locals[name];
                if (!v) return null;
                return (
                  <div className="lt-var" key={name}>
                    <dt>{name}</dt>
                    <dd>
                      <ValuePill
                        value={v}
                        sourceKey={`${f.id}:${name}`}
                        heap={step.heap}
                        changed={diff.locals.has(`${f.id}:${name}`)}
                      />
                    </dd>
                  </div>
                );
              })}
              {f.returnValue !== undefined && (
                <div className="lt-var lt-return">
                  <dt>return</dt>
                  <dd>
                    <ValuePill
                      value={f.returnValue}
                      sourceKey={`${f.id}:<return>`}
                      heap={step.heap}
                      changed
                    />
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
