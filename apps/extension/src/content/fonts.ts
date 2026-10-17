// The panel's typefaces (Geist Sans + IBM Plex Mono), bundled with the extension. @font-face
// rules are ignored inside a shadow root, so they go on the page's document once; the files
// are web-accessible extension assets, so nothing is fetched from a CDN.
import geist400 from '@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url';
import geist500 from '@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url';
import geist600 from '@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url';
import geist700 from '@fontsource/geist-sans/files/geist-sans-latin-700-normal.woff2?url';
import plex400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import plex500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import plex600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url';

const FACES: [family: string, weight: number, url: string][] = [
  ['Geist Sans', 400, geist400],
  ['Geist Sans', 500, geist500],
  ['Geist Sans', 600, geist600],
  ['Geist Sans', 700, geist700],
  ['IBM Plex Mono', 400, plex400],
  ['IBM Plex Mono', 500, plex500],
  ['IBM Plex Mono', 600, plex600],
];

const STYLE_ID = 'leettrace-fonts';

export function injectFonts(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const resolve = (u: string) =>
    typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(u) : u;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FACES.map(
    ([family, weight, url]) =>
      `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url('${resolve(url)}') format('woff2');}`,
  ).join('\n');
  (doc.head ?? doc.documentElement).appendChild(style);
}
