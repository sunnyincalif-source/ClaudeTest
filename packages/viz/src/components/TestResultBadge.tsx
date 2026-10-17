import type { TestResult } from '@leettrace/schema';

export function TestResultBadge({ test }: { test: TestResult }) {
  const state = test.error
    ? 'error'
    : test.passed === true
      ? 'pass'
      : test.passed === false
        ? 'fail'
        : 'none';
  const label = { pass: 'Passed', fail: 'Wrong answer', error: 'Error', none: 'Ran' }[state];
  return (
    <div className={`lt-test lt-test-${state}`} role="status">
      <span className="lt-test-badge">
        {state === 'pass' ? '✓' : state === 'none' ? '•' : '✗'} {label}
      </span>
      <span className="lt-test-detail">
        <span className="lt-dim">Case {test.index + 1}:</span> <code>{test.input}</code>
      </span>
      {test.actual !== undefined && (
        <span className="lt-test-detail">
          <span className="lt-dim">Output</span> <code>{test.actual}</code>
        </span>
      )}
      {test.expected !== undefined && (
        <span className="lt-test-detail">
          <span className="lt-dim">Expected</span> <code>{test.expected}</code>
        </span>
      )}
      {test.error && <span className="lt-test-detail lt-exc-text">{test.error}</span>}
    </div>
  );
}
