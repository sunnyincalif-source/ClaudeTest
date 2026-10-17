import { useEffect, useRef } from 'react';

interface Props {
  source: string;
  line: number;
  errorLine?: number;
}

export function SourceView({ source, line, errorLine }: Props) {
  const lines = source.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'nearest' });
  }, [line]);
  return (
    <section className="lt-source" aria-label="Source code">
      <ol className="lt-code">
        {lines.map((text, i) => {
          const n = i + 1;
          const isCur = n === line;
          const cls = `lt-code-line${isCur ? ' lt-code-current' : ''}${n === errorLine ? ' lt-code-error' : ''}`;
          return (
            <li
              key={n}
              className={cls}
              ref={isCur ? current : undefined}
              aria-current={isCur ? 'step' : undefined}
            >
              <span className="lt-code-no" aria-hidden="true">
                {n}
              </span>
              <span className="lt-code-marker" aria-hidden="true">
                {isCur ? '➜' : ''}
              </span>
              <code>{text || ' '}</code>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
