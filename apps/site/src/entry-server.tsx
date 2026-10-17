// Build-time prerender (scripts/prerender.mjs): the page ships as real HTML so the hero paints
// before any JavaScript runs; main.tsx then hydrates it.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';

export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
