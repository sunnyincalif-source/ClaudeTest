// LeetTrace design tokens: the single source of truth for color, type, shape and motion.
// Consumed by packages/viz (the trace panel), apps/site, apps/web and the extension chrome.
// `tokens.css` is generated from this file (`pnpm --filter @leettrace/design gen`); a test
// fails if the two drift. Signed-off reference: docs/ui-reference.html.
//
// Identity: modern dev-tool dark (Linear × Vercel). Electric blue + cyan are the ONLY
// accents — no purple, violet or magenta anywhere. Green = pass, red = fail.

export type ColorTokens = Record<ColorToken, string>;

export const COLOR_TOKENS = [
  'bg',
  'bg-elev',
  'bg-elev-2',
  'bg-elev-3',
  'border',
  'border-strong',
  'fg',
  'fg-muted',
  'fg-faint',
  'accent',
  'accent-2',
  'accent-ink',
  'accent-soft',
  'accent-glow',
  'grad',
  'good',
  'good-soft',
  'bad',
  'bad-soft',
  'warn',
  'warn-soft',
  'ptr-curr',
  'ptr-prev',
  'ptr-next',
  'ptr-head',
  'node',
  'kw',
  'num',
  'fn',
  'str',
  'self',
  'shadow',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

const mix = (v: string, pct: number) => `color-mix(in srgb, var(--${v}) ${pct}%, transparent)`;

/** Dark — the primary world. Locked values from SPEC-PRODUCT §4 / docs/ui-reference.html. */
export const dark: ColorTokens = {
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
  'accent-ink': '#06080c',
  'accent-soft': mix('accent', 16),
  'accent-glow': mix('accent', 40),
  grad: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
  good: '#2dd4a0',
  'good-soft': mix('good', 15),
  bad: '#f4515b',
  'bad-soft': mix('bad', 15),
  warn: '#f0b254',
  'warn-soft': mix('warn', 15),
  'ptr-curr': 'var(--accent)',
  'ptr-prev': 'var(--good)',
  'ptr-next': 'var(--accent-2)',
  'ptr-head': '#6b7482',
  node: 'var(--bg-elev-2)',
  kw: '#4d9fff',
  num: '#2dd4a0',
  fn: '#22d3ee',
  str: '#c9a24a',
  self: '#f4515b',
  shadow: '#000000',
};

/**
 * Light — trace panel only (the site is dark-only). Inverts canvas/surface/text and keeps
 * the same hues, darkened just enough to stay AA-legible as text on white.
 */
export const light: ColorTokens = {
  bg: '#ffffff',
  'bg-elev': '#f7f8fa',
  'bg-elev-2': '#eff1f4',
  'bg-elev-3': '#e6e9ee',
  border: '#e1e4e9',
  'border-strong': '#cdd2da',
  fg: '#0b0d12',
  'fg-muted': '#4f5763',
  'fg-faint': '#6b7380',
  accent: '#1a64cf',
  'accent-2': '#0a7090',
  'accent-ink': '#ffffff',
  'accent-soft': mix('accent', 12),
  'accent-glow': mix('accent', 30),
  grad: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
  good: '#08775a',
  'good-soft': mix('good', 12),
  bad: '#c52532',
  'bad-soft': mix('bad', 11),
  warn: '#965a00',
  'warn-soft': mix('warn', 13),
  'ptr-curr': 'var(--accent)',
  'ptr-prev': 'var(--good)',
  'ptr-next': 'var(--accent-2)',
  'ptr-head': '#6b7380',
  node: 'var(--bg-elev)',
  kw: '#1a64cf',
  num: '#08775a',
  fn: '#0a7090',
  str: '#7a5c0c',
  self: '#c52532',
  shadow: '#0b0d12',
};

/** Theme-independent tokens: type, shape, motion. */
export const base = {
  'font-sans': '"Geist Sans", "Geist", system-ui, -apple-system, "Segoe UI", sans-serif',
  'font-mono': '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  'r-sm': '6px',
  'r-md': '8px',
  'r-lg': '10px',
  'r-xl': '14px',
  'dur-fast': '120ms',
  dur: '180ms',
  'dur-slow': '220ms',
  'ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  'ease-spring': 'cubic-bezier(0.34, 1.2, 0.4, 1)',
} as const;
export type BaseToken = keyof typeof base;

/** `var(--name)` helper for inline styles and SVG attributes. */
export const cssVar = (name: ColorToken | BaseToken) => `var(--${name})`;

/** Hex values that are part of the system (used by the no-stray-hex guard test). */
export function systemHexes(): Set<string> {
  const out = new Set<string>();
  for (const set of [dark, light])
    for (const v of Object.values(set))
      for (const m of v.match(/#[0-9a-f]{3,8}\b/gi) ?? []) out.add(m.toLowerCase());
  return out;
}

/**
 * The generated stylesheet:
 * - `:root` / `:host` carry the base tokens and default to dark (the site is dark-only);
 * - the trace panel (`.lt-viz`) and anything marked `.ds-auto` follow the OS theme;
 * - `[data-theme='light' | 'dark']` forces a theme on that subtree (declared last, so it wins).
 */
export function renderTokensCss(): string {
  const scheme = (s: 'light' | 'dark') => ({ 'color-scheme': s });
  const raw = (sel: string, vars: Record<string, string>, extra: Record<string, string> = {}) => {
    const lines = [
      ...Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`),
      ...Object.entries(extra).map(([k, v]) => `  ${k}: ${v};`),
    ];
    return `${sel} {\n${lines.join('\n')}\n}\n`;
  };
  const indent = (css: string) =>
    css
      .split('\n')
      .map((l) => (l ? `  ${l}` : l))
      .join('\n');
  return [
    '/* GENERATED from src/tokens.ts by `pnpm --filter @leettrace/design gen`. Do not edit. */\n',
    raw(':root,\n:host', { ...base, ...dark }, scheme('dark')),
    raw('.lt-viz,\n.ds-auto', dark, scheme('dark')),
    '@media (prefers-color-scheme: light) {\n' +
      indent(
        raw(
          ".lt-viz:not([data-theme='dark']),\n.ds-auto:not([data-theme='dark'])",
          light,
          scheme('light'),
        ),
      ) +
      '}\n',
    raw("[data-theme='light']", light, scheme('light')),
    raw("[data-theme='dark']", dark, scheme('dark')),
  ].join('\n');
}
