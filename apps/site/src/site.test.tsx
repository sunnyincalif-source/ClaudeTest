import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectFromUA, detect, ASSETS } from './platform';
import { resolveRelease, formatSize } from './release';
import { App } from './App';

const RELEASE = {
  tag_name: 'v1.0.0',
  html_url: 'https://github.com/o/r/releases/tag/v1.0.0',
  assets: Object.values(ASSETS).map((a, i) => ({
    name: a.name,
    size: 30_000_000 + i,
    browser_download_url: `https://github.com/o/r/releases/download/v1.0.0/${a.name}`,
    digest: `sha256:${'ab'.repeat(32)}`,
  })),
};

describe('OS detection', () => {
  it('maps user agents to the right build', () => {
    expect(detectFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)').platform).toBe('windows-x64');
    expect(detectFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toEqual({
      platform: 'macos-arm64',
      archKnown: false,
    });
    expect(detectFromUA('Mozilla/5.0 (X11; Linux x86_64)').platform).toBe('linux-x64');
    expect(
      detectFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').platform,
    ).toBeNull();
  });
  it('uses client hints to tell Intel Macs from Apple silicon', async () => {
    const nav = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      userAgentData: {
        platform: 'macOS',
        mobile: false,
        getHighEntropyValues: async () => ({ architecture: 'x86' }),
      },
    } as unknown as Navigator;
    expect(await detect(nav)).toEqual({ platform: 'macos-x64', archKnown: true });
  });
});

describe('release resolution', () => {
  afterEach(() => sessionStorage.clear());

  it('uses the GitHub API (version, size, sha)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(RELEASE), { status: 200 }));
    const r = await resolveRelease('o/r', null, f as unknown as typeof fetch);
    const a = r.asset('LeetTrace-Setup-windows-x64.exe');
    expect(r.tag).toBe('v1.0.0');
    expect(a.url).toContain('/download/v1.0.0/LeetTrace-Setup-windows-x64.exe');
    expect(a.sha256).toBe('ab'.repeat(32));
    expect(formatSize(a.size)).toBe('28.6 MB');
  });

  it('falls back to the build-time release, then to latest/download URLs', async () => {
    const down = vi.fn(async () => new Response('rate limited', { status: 403 }));
    const baked = {
      tag: 'v0.9.0',
      htmlUrl: 'x',
      assets: [{ name: 'leettrace-linux-x64', url: 'https://baked/linux', size: 1, digest: null }],
    };
    const fromBuild = await resolveRelease('o/r', baked, down as unknown as typeof fetch);
    expect(fromBuild.source).toBe('build');
    expect(fromBuild.asset('leettrace-linux-x64').url).toBe('https://baked/linux');
    sessionStorage.clear();
    const none = await resolveRelease('o/r', null, down as unknown as typeof fetch);
    expect(none.source).toBe('fallback');
    expect(none.asset('LeetTrace-macos-arm64.dmg').url).toMatch(
      /\/releases\/latest\/download\/LeetTrace-macos-arm64\.dmg$/,
    );
  });
});

describe('asset names across releases', () => {
  afterEach(() => sessionStorage.clear());

  it('uses the v1.0 file names while the latest release predates the installers', async () => {
    const old = {
      ...RELEASE,
      assets: ['LeetTrace-windows-x64.exe', 'leettrace-linux-x64'].map((name) => ({
        name,
        size: 1,
        browser_download_url: `https://gh/v1.0.0/${name}`,
        digest: null,
      })),
    };
    const f = vi.fn(async () => new Response(JSON.stringify(old), { status: 200 }));
    const r = await resolveRelease('o/r', null, f as unknown as typeof fetch);
    const win = ASSETS['windows-x64'];
    const linux = ASSETS['linux-x64'];
    expect(r.pick(win.name, win.legacy).url).toBe('https://gh/v1.0.0/LeetTrace-windows-x64.exe');
    expect(r.pick(linux.name, linux.legacy).url).toBe('https://gh/v1.0.0/leettrace-linux-x64');
  });
});

describe('page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('renders the §8 sections with §9 copy, an OS-detected download, and no pairing-code or terminal steps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(RELEASE), { status: 200 })),
    );
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    });
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'See your code actually run.',
    );
    expect(
      screen.getByText(/LeetTrace rides along with your LeetCode practice/),
    ).toBeInTheDocument();
    expect(screen.getByText('100% local · open source', { exact: false })).toBeInTheDocument();
    const dl = (await screen.findAllByRole('link', { name: /Download for Windows/ }))[0]!;
    expect(dl).toHaveAttribute('href', expect.stringContaining('LeetTrace-Setup-windows-x64.exe'));
    expect(dl).toHaveTextContent('v1.0.0');
    expect(screen.getByRole('tab', { name: 'Windows' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText(/More info → Run anyway/).length).toBeGreaterThan(0);
    for (const h of ['Download & install.', 'Add to Chrome.', 'Open any LeetCode problem.'])
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    const faq = screen.getByRole('heading', { name: 'Questions, answered.' }).parentElement!;
    expect(within(faq).getAllByRole('group').length).toBe(5);
    expect(within(faq).getByText('No — it connects automatically.')).toBeInTheDocument();
    expect(
      screen.getAllByText(/not affiliated with or endorsed by LeetCode/).length,
    ).toBeGreaterThan(0);
    // The flow is automatic: no pairing codes, no terminal commands for normal users.
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/pairing code|leettrace start|pipx|6-digit/i);
    // "Add to Chrome" falls back to the unpacked steps while STORE_URL is empty.
    expect(screen.getAllByRole('link', { name: /Add to Chrome/ })[0]).toHaveAttribute(
      'href',
      '#install-extension',
    );
    expect(screen.getByRole('link', { name: 'Privacy policy →' })).toHaveAttribute(
      'href',
      '/privacy/',
    );
  });
});
