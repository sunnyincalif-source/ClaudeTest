import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@leettrace/design/fonts.css';
import '@leettrace/design/tokens.css';
import '@leettrace/design/components.css';
import './styles.css';
import { App } from './App';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The build prerenders the page into #root (scripts/prerender.mjs); hydrate it.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
