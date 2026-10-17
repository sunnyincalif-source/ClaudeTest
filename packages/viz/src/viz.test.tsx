import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseTrace, type Trace } from '@leettrace/schema';
import reverseJson from '../fixtures/linked_list_reverse.json';
import bstJson from '../fixtures/bst_insert_inorder.json';
import factorialJson from '../fixtures/factorial.json';
import divJson from '../fixtures/exception_divzero.json';
import { TraceViewer } from './components/TraceViewer';
import { edgeGeometry } from './components/ArrowLayer';
import { computeLayout } from './lib/layout';
import { playbackReducer } from './lib/usePlayback';
import { diffSteps } from './lib/diff';

const reverse = parseTrace(reverseJson);
const bst = parseTrace(bstJson);
const factorial = parseTrace(factorialJson);
const divzero = parseTrace(divJson);

function valOf(trace: Trace, id: string): number {
  for (const s of trace.steps) {
    const o = s.heap[id];
    if (o?.type === 'instance' && o.fields.val?.kind === 'int') return o.fields.val.value;
  }
  throw new Error(id);
}

describe('layout', () => {
  it('lays a linked list out left-to-right in list order, on one row', () => {
    const layout = computeLayout(reverse);
    const nodes = [...layout.grid.entries()].sort((a, b) => a[1].col - b[1].col);
    expect(nodes.map(([id]) => valOf(reverse, id))).toEqual([1, 2, 3, 4]);
    expect(new Set(nodes.map(([, p]) => p.row)).size).toBe(1);
  });

  it('lays a BST out in-order with depth rows', () => {
    const layout = computeLayout(bst);
    const byCol = [...layout.grid.entries()].sort((a, b) => a[1].col - b[1].col);
    expect(byCol.map(([id]) => valOf(bst, id))).toEqual([1, 3, 4, 5, 8, 9]);
    const rowOf = new Map(byCol.map(([id, p]) => [valOf(bst, id), p.row]));
    expect(rowOf.get(5)).toBe(0);
    expect(rowOf.get(3)).toBe(1);
    expect(rowOf.get(8)).toBe(1);
    expect(rowOf.get(1)).toBe(2);
    expect(rowOf.get(9)).toBe(2);
  });
});

function canvasHtml(container: HTMLElement): string {
  const canvas = container.querySelector('.lt-canvas')!.cloneNode(true) as HTMLElement;
  canvas.querySelector('svg')?.remove();
  return canvas.innerHTML;
}

describe('TraceViewer', () => {
  it('scrubbing and stepping land on identical views (pure function of step)', () => {
    const a = render(<TraceViewer trace={reverse} />);
    const region = a.container.querySelector('.lt-viz') as HTMLElement;
    for (let i = 0; i < 30; i++) fireEvent.keyDown(region, { key: 'ArrowRight' });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(region, { key: 'ArrowLeft' });
    const stepped = canvasHtml(a.container);
    a.unmount();

    const b = render(<TraceViewer trace={reverse} />);
    fireEvent.change(screen.getByLabelText('Timeline'), { target: { value: '25' } });
    expect(canvasHtml(b.container)).toBe(stepped);
    b.unmount();

    const c = render(<TraceViewer trace={reverse} initial={{ stepIndex: 25 }} />);
    expect(canvasHtml(c.container)).toBe(stepped);
  });

  it('keeps every heap node at the same position across all steps', () => {
    const { container } = render(<TraceViewer trace={reverse} />);
    const positions = new Map<string, string>();
    const slider = screen.getByLabelText('Timeline');
    for (let i = 0; i < reverse.steps.length; i++) {
      fireEvent.change(slider, { target: { value: String(i) } });
      container.querySelectorAll<HTMLElement>('.lt-grid-cell').forEach((cell) => {
        const id = cell.querySelector<HTMLElement>('[data-heap-id]')!.dataset.heapId!;
        const pos = `${cell.style.left},${cell.style.top}`;
        if (positions.has(id)) expect(pos).toBe(positions.get(id));
        positions.set(id, pos);
      });
    }
    expect(positions.size).toBe(4);
  });

  it('pushes and pops frames through recursion', () => {
    render(<TraceViewer trace={factorial} />);
    const slider = screen.getByLabelText('Timeline');
    const depth = () => within(screen.getByLabelText('Call stack')).getAllByRole('listitem').length;
    const seen: number[] = [];
    for (let i = 0; i < factorial.steps.length; i++) {
      fireEvent.change(slider, { target: { value: String(i) } });
      seen.push(depth());
      expect(depth()).toBe(factorial.steps[i]!.stack.length);
    }
    expect(Math.max(...seen)).toBe(6);
  });

  it('shows the step note in a live region', () => {
    render(<TraceViewer trace={factorial} initial={{ stepIndex: 2 }} />);
    expect(screen.getByText(factorial.steps[2]!.note!)).toBeInTheDocument();
  });

  it('renders ref pills as arrow anchors pointing at existing heap cards', () => {
    const { container } = render(<TraceViewer trace={reverse} initial={{ stepIndex: 30 }} />);
    const anchors = container.querySelectorAll<HTMLElement>('[data-ref-source]');
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      const target = a.dataset.refTarget!;
      expect(container.querySelector(`[data-heap-id="${target}"]`)).not.toBeNull();
    }
  });

  it('shows where an exception blew up', () => {
    render(<TraceViewer trace={divzero} initial={{ stepIndex: divzero.steps.length - 1 }} />);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('ZeroDivisionError');
  });

  it('warns on engine version mismatch instead of misrendering silently', () => {
    render(<TraceViewer trace={{ ...factorial, engineVersion: '9.9.0' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Update LeetTrace');
  });

  it('shows pass/fail for a LeetCode case', () => {
    render(
      <TraceViewer
        trace={{
          ...factorial,
          test: { index: 0, input: 'n = 5', expected: '120', actual: '121', passed: false },
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Wrong answer');
  });

  it('plays with Space and stops at the end', () => {
    const r = playbackReducer({ stepIndex: 4, playing: true, speed: 2 }, { type: 'tick', max: 4 });
    expect(r.playing).toBe(false);
    expect(r.stepIndex).toBe(4);
    const { container } = render(<TraceViewer trace={factorial} />);
    const region = container.querySelector('.lt-viz') as HTMLElement;
    act(() => {
      fireEvent.keyDown(region, { key: ' ' });
    });
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });
});

describe('diff + geometry', () => {
  it('flags exactly the pointer that flips', () => {
    const i = reverse.steps.findIndex(
      (s, k) => k > 0 && s.line === 14 && reverse.steps[k - 1]!.line === 13,
    );
    const d = diffSteps(reverse.steps[i - 1], reverse.steps[i]!);
    expect([...d.slots].filter((s) => s.endsWith(':next'))).toHaveLength(1);
  });

  it('routes right-hand targets into the left edge and loops self references', () => {
    const src = { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
    const dst = { left: 100, top: 0, right: 200, bottom: 50, width: 100, height: 50 };
    const g = edgeGeometry(src, dst, false);
    expect(g[6]).toBe(100);
    const loop = edgeGeometry(src, dst, true);
    expect(loop[7]).toBe(0);
  });
});
