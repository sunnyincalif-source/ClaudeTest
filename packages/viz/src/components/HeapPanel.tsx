import type { CSSProperties } from 'react';
import type { HeapObject, Step } from '@leettrace/schema';
import type { StepDiff } from '../lib/diff';
import { valueKey } from '../lib/format';
import { orderedContainers, type HeapLayout } from '../lib/layout';
import { ValuePill } from './ValuePill';

export const CELL_W = 150;
export const MAX_VISIBLE = 60;

interface Props {
  step: Step;
  layout: HeapLayout;
  diff: StepDiff;
}

export function cellHeight(layout: HeapLayout): number {
  return 40 + Math.max(1, layout.maxFields) * 26 + 22;
}

export function HeapPanel({ step, layout, diff }: Props) {
  const all = Object.values(step.heap);
  const instances = all.filter((o) => o.type === 'instance' && layout.grid.has(o.id));
  const containers = orderedContainers(step.heap, layout);
  const visibleInstances = instances.slice(0, MAX_VISIBLE);
  const room = Math.max(0, MAX_VISIBLE - visibleInstances.length);
  const visibleContainers = containers.slice(0, room);
  const hidden = all.length - visibleInstances.length - visibleContainers.length;
  const cellH = cellHeight(layout);
  const gridStyle: CSSProperties = {
    width: layout.cols * CELL_W,
    height: instances.length > 0 ? layout.rows * cellH : 0,
  };

  return (
    <section className="lt-heap" aria-label="Heap objects">
      <h2 className="lt-panel-title">Heap</h2>
      {all.length === 0 && <p className="lt-empty">Nothing on the heap yet.</p>}
      {instances.length > 0 && (
        <div className="lt-grid" style={gridStyle}>
          {visibleInstances.map((obj) => {
            const pos = layout.grid.get(obj.id)!;
            return (
              <div
                key={obj.id}
                className="lt-grid-cell"
                style={{ left: pos.col * CELL_W, top: pos.row * cellH }}
              >
                <HeapCard obj={obj} step={step} diff={diff} />
              </div>
            );
          })}
        </div>
      )}
      {visibleContainers.length > 0 && (
        <div className="lt-containers">
          {visibleContainers.map((obj) => (
            <HeapCard key={obj.id} obj={obj} step={step} diff={diff} />
          ))}
        </div>
      )}
      {hidden > 0 && (
        <p className="lt-more" role="note">
          +{hidden} more object{hidden === 1 ? '' : 's'} not shown
        </p>
      )}
    </section>
  );
}

function HeapCard({ obj, step, diff }: { obj: HeapObject; step: Step; diff: StepDiff }) {
  const isNew = diff.newObjects.has(obj.id);
  const common = {
    'data-heap-id': obj.id,
    className: `lt-card lt-card-${obj.type}${isNew ? ' lt-card-new' : ''}`,
  };
  const changed = (slot: string) => diff.slots.has(`${obj.id}:${slot}`);

  switch (obj.type) {
    case 'instance':
      return (
        <div {...common} role="group" aria-label={`${obj.className} object`}>
          <div className="lt-card-head">{obj.className}</div>
          <dl className="lt-fields">
            {Object.entries(obj.fields).map(([name, v]) => (
              <div className="lt-var" key={name}>
                <dt>{name}</dt>
                <dd>
                  <ValuePill
                    value={v}
                    sourceKey={`${obj.id}:${name}`}
                    heap={step.heap}
                    changed={changed(name)}
                  />
                </dd>
              </div>
            ))}
            {Object.keys(obj.fields).length === 0 && (
              <div className="lt-empty lt-empty-sm">no fields</div>
            )}
          </dl>
        </div>
      );
    case 'dict':
      return (
        <div {...common} role="group" aria-label={`dict with ${obj.entries.length} entries`}>
          <div className="lt-card-head">dict</div>
          {obj.entries.length === 0 && <div className="lt-empty lt-empty-sm">empty</div>}
          <table className="lt-dict">
            <tbody>
              {obj.entries.map((e, i) => {
                const slot = valueKey(e.key);
                return (
                  <tr key={slot}>
                    <td>
                      <ValuePill value={e.key} sourceKey={`${obj.id}:k${i}`} heap={step.heap} />
                    </td>
                    <td className="lt-dict-arrow" aria-hidden="true">
                      :
                    </td>
                    <td>
                      <ValuePill
                        value={e.value}
                        sourceKey={`${obj.id}:v${i}`}
                        heap={step.heap}
                        changed={changed(slot)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    default: {
      const label = obj.type;
      return (
        <div {...common} role="group" aria-label={`${label} of ${obj.items.length} items`}>
          <div className="lt-card-head">
            {label} <span className="lt-dim">len {obj.items.length}</span>
          </div>
          {obj.items.length === 0 && <div className="lt-empty lt-empty-sm">empty</div>}
          <ol className="lt-seq">
            {obj.items.map((v, i) => (
              <li key={i} className="lt-seq-cell">
                {obj.type !== 'set' && <span className="lt-seq-idx">{i}</span>}
                <ValuePill
                  value={v}
                  sourceKey={`${obj.id}:${i}`}
                  heap={step.heap}
                  changed={changed(String(i))}
                />
              </li>
            ))}
          </ol>
        </div>
      );
    }
  }
}
