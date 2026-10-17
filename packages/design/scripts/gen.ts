// Regenerates src/tokens.css from src/tokens.ts. Run: pnpm --filter @leettrace/design gen
import { writeFileSync } from 'node:fs';
import { renderTokensCss } from '../src/tokens.ts';

writeFileSync(new URL('../src/tokens.css', import.meta.url), renderTokensCss());
console.log('wrote src/tokens.css');
