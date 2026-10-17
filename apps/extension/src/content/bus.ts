// Tiny event bus between the injected "Trace" button / navigation watcher and the panel.
export type BusEvent = 'trace' | 'toggle' | 'open' | 'navigate';
const listeners = new Set<(e: BusEvent) => void>();

export const bus = {
  emit(e: BusEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: (e: BusEvent) => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
