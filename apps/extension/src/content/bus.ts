// Tiny event bus between the injected "Trace" button (light DOM) and the React panel.
type Event = 'trace' | 'toggle' | 'open';
const listeners = new Set<(e: Event) => void>();

export const bus = {
  emit(e: Event) {
    listeners.forEach((l) => l(e));
  },
  on(l: (e: Event) => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
