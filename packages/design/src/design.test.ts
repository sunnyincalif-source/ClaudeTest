import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dark, light, renderTokensCss, systemHexes, type ColorTokens } from './tokens';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue in degrees and saturation 0..1 (HSL). */
function hueSat(hex: string): [number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s];
}

/** Resolve a token to a hex (following `var(--x)` aliases). */
function resolve(set: ColorTokens, name: keyof ColorTokens): string {
  let v = set[name];
  for (let i = 0; i < 5 && v.startsWith('var(--'); i++)
    v = set[v.slice(6, -1) as keyof ColorTokens];
  if (!v.startsWith('#')) throw new Error(`${name} is not a solid color: ${v}`);
  return v;
}

describe('design tokens', () => {
  it('tokens.css is generated from tokens.ts (run `pnpm --filter @leettrace/design gen`)', () => {
    expect(readFileSync(join(here, 'tokens.css'), 'utf8')).toBe(renderTokensCss());
  });

  it('keeps the locked reference values', () => {
    expect(dark).toMatchObject({
      bg: '#08090c',
      'bg-elev': '#0e1014',
      'bg-elev-2': '#15181d',
      'bg-elev-3': '#1b1f26',
      border: '#1d2128',
      'border-strong': '#2b313a',
      fg: '#eceef2',
      'fg-muted': '#98a0ab',
      'fg-faint': '#5f6873',
      accent: '#4d9fff',
      'accent-2': '#22d3ee',
      good: '#2dd4a0',
      bad: '#f4515b',
    });
  });

  it('uses no purple, violet or magenta anywhere', () => {
    for (const hex of systemHexes()) {
      const [h, s] = hueSat(hex);
      if (s < 0.15) continue; // greys
      expect([hex, h >= 250 && h <= 335]).toEqual([hex, false]);
    }
  });

  for (const [themeName, set] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    it(`${themeName}: text and accents meet WCAG AA on the canvas and surfaces`, () => {
      const surfaces = (['bg', 'bg-elev', 'bg-elev-2'] as const).map((s) => resolve(set, s));
      const text = ['fg', 'fg-muted', 'accent', 'good', 'bad', 'warn', 'kw', 'num', 'fn', 'str'];
      for (const t of text)
        for (const s of surfaces) {
          const ratio = contrast(resolve(set, t as keyof ColorTokens), s);
          expect([t, s, ratio >= 4.5]).toEqual([t, s, true]);
        }
      // Captions (fg-faint) are large/secondary: AA-large 3:1 on the canvas.
      expect(contrast(resolve(set, 'fg-faint'), resolve(set, 'bg'))).toBeGreaterThanOrEqual(3);
      // Text on the solid accent (primary buttons).
      expect(contrast(resolve(set, 'accent-ink'), resolve(set, 'accent'))).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
});

// "No surface may hardcode a hex outside this system" (SPEC-PRODUCT §2).
// Surfaces join this list as they move onto the system (all of them by Phase 19).
const SURFACES = [
  'packages/viz/src',
  'packages/viz/harness',
  'apps/extension/src/content',
  'apps/extension/src/shared',
];
const STYLE_FILES = /\.(css|tsx?)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'generated') return [];
    return statSync(p).isDirectory() ? walk(p) : STYLE_FILES.test(name) ? [p] : [];
  });
}

describe('no stray colors', () => {
  it('surfaces take every color from the design system', () => {
    const offenders: string[] = [];
    for (const dir of SURFACES)
      for (const file of walk(join(repo, dir))) {
        if (/\.test\.tsx?$/.test(file)) continue;
        const src = readFileSync(file, 'utf8');
        src.split('\n').forEach((line, i) => {
          for (const m of line.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
            if (/^#[0-9]+$/.test(m) && !/color|fill|stroke|background|#[0-9]{3}\b/i.test(line))
              continue; // e.g. "#1" in prose
            offenders.push(`${relative(repo, file)}:${i + 1} ${m}`);
          }
        });
      }
    expect(offenders).toEqual([]);
  });
});
