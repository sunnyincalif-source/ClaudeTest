import type { Step } from '@leettrace/schema';

export function OutputPane({ step }: { step: Step }) {
  return (
    <section className="lt-output" aria-label="Program output">
      <h2 className="lt-panel-title">Output</h2>
      {step.stdout ? <pre>{step.stdout}</pre> : <p className="lt-empty">No output yet.</p>}
      {step.exception && (
        <p className="lt-exc" role="alert">
          {step.exception.type}: {step.exception.message}
        </p>
      )}
    </section>
  );
}
