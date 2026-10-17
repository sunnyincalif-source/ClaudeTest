// Site configuration (build-time env, see apps/site/.env). Static site: no backend.
const env = import.meta.env;

/** owner/name of the public GitHub repo whose Releases host the downloads. */
export const GITHUB_REPO: string = env.VITE_GITHUB_REPO || 'sunnyincalif-source/leettrace';
/** Chrome Web Store listing; empty until published (then "Add to Chrome" links there). */
export const CHROME_STORE_URL: string = env.VITE_CHROME_STORE_URL || '';
export const REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const latestDownload = (asset: string) => `${RELEASES_URL}/latest/download/${asset}`;
