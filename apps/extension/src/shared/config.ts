// Build-time configuration. Override with VITE_LEETTRACE_SITE_URL (see the repo-root .env).
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** Base URL of the LeetTrace site (apps/site). No trailing slash. */
export const SITE_URL = (env.VITE_LEETTRACE_SITE_URL || 'https://leettrace.vercel.app').replace(
  /\/+$/,
  '',
);

/** The site's install section: engine download, extension install, pairing. */
export const INSTALL_URL = `${SITE_URL}/#install`;
