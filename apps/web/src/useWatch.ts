import { useEffect, useState } from 'react';
import { parseTrace, type Trace } from '@leettrace/schema';

export type LinkState = 'connecting' | 'live' | 'offline';

export interface WatchedRun {
  runId: string;
  label: string;
  trace: Trace;
  receivedAt: number;
}

/** Subscribe to WS /watch: the engine pushes every published run (run/watch/extension). */
export function useWatch(token: string | null, onRun: (run: WatchedRun) => void): LinkState {
  const [state, setState] = useState<LinkState>('connecting');
  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/watch?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        retry = 0;
        setState('live');
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type: string;
            runId: string;
            label: string;
            trace: unknown;
          };
          if (msg.type === 'trace') {
            onRun({
              runId: msg.runId,
              label: msg.label,
              trace: parseTrace(msg.trace),
              receivedAt: Date.now(),
            });
          }
        } catch {
          // ignore malformed pushes
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setState('offline');
        retry = Math.min(retry + 1, 6);
        timer = window.setTimeout(connect, 500 * 2 ** retry);
      };
    };
    connect();
    const ping = window.setInterval(
      () => ws?.readyState === WebSocket.OPEN && ws.send('ping'),
      20_000,
    );
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(ping);
      ws?.close();
    };
  }, [token, onRun]);
  return token ? state : 'offline';
}
