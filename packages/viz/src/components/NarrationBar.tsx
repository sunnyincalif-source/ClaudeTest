import type { Step } from '@leettrace/schema';

const EVENT_LABEL: Record<Step['event'], string> = {
  line: 'line',
  call: 'call',
  return: 'return',
  exception: 'exception',
};

export function NarrationBar({ step }: { step: Step }) {
  return (
    <div className={`lt-narration lt-ev-${step.event}`}>
      <span className="lt-ev">{EVENT_LABEL[step.event]}</span>
      <p aria-live="polite" aria-atomic="true">
        {step.note ?? `Line ${step.line}`}
      </p>
    </div>
  );
}
