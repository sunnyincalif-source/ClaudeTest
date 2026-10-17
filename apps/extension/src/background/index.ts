// Background service worker:
// 1. Reads the code from LeetCode's Monaco editor, which lives on the page's `window` (MAIN
//    world) where content scripts can't reach.
// 2. Automatic pairing (SPEC-PRODUCT §6): receives the session token from the engine's own
//    page (externally_connectable, validated sender), and opens that page in a background tab
//    when the panel needs a (re)connect. No code is shown or typed.
import { parsePairMessage, type PairReply } from '@leettrace/schema';
import { readMonacoInPage } from '../content/leetcodePage';
import { getPairing, setPairing } from '../shared/storage';

const DEFAULT_PORT = 47823;
const PORT_SCAN = 10;
const CONNECT_TABS = 'leettrace.connectTabs';
const CONNECT_TAB_TTL_MS = 20_000;

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; port?: number; active?: boolean }, sender, sendResponse) => {
    if (msg?.type === 'leettrace:connect') {
      if (typeof msg.port !== 'number') return false;
      void openConnectTab(msg.port, !!msg.active).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type !== 'leettrace:readEditor' || sender.tab?.id === undefined) return false;
    const url = sender.tab.url ?? '';
    if (!url.startsWith('https://leetcode.com/problems/')) {
      sendResponse(null);
      return false;
    }
    chrome.scripting
      .executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
        world: 'MAIN',
        func: readMonacoInPage,
      })
      .then((results) => sendResponse(results[0]?.result ?? null))
      .catch(() => sendResponse(null));
    return true; // async response
  },
);

// The engine's page (http://127.0.0.1:<port>) hands over the token. parsePairMessage checks
// the message shape *and* that the sender really is that page on that port.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const pair = parsePairMessage(msg, sender.url);
  if (!pair) {
    sendResponse({ ok: false, error: 'not a LeetTrace engine page' } satisfies PairReply);
    return false;
  }
  void (async () => {
    await setPairing({ port: pair.port, token: pair.token, version: pair.version, via: 'auto' });
    sendResponse({
      ok: true,
      extensionVersion: chrome.runtime.getManifest().version,
    } satisfies PairReply);
    const tabId = sender.tab?.id;
    if (tabId !== undefined && (await takeConnectTab(tabId)))
      setTimeout(() => void chrome.tabs.remove(tabId).catch(() => undefined), 400);
  })();
  return true;
});

/** Open the engine's page just to hand over the token (closed again as soon as it has). */
async function openConnectTab(port: number, active: boolean): Promise<void> {
  const tab = await chrome.tabs.create({ url: `http://127.0.0.1:${port}/#view=connect`, active });
  if (tab.id === undefined) return;
  const tabs = await connectTabs();
  tabs[tab.id] = Date.now();
  await chrome.storage.session.set({ [CONNECT_TABS]: tabs });
  if (!active) {
    // Never leave a stray background tab behind if the handshake doesn't happen.
    const id = tab.id;
    setTimeout(() => {
      void takeConnectTab(id).then((ours) => {
        if (ours) void chrome.tabs.remove(id).catch(() => undefined);
      });
    }, CONNECT_TAB_TTL_MS);
  }
}

async function connectTabs(): Promise<Record<number, number>> {
  const got = await chrome.storage.session.get(CONNECT_TABS);
  return (got[CONNECT_TABS] as Record<number, number> | undefined) ?? {};
}

async function takeConnectTab(id: number): Promise<boolean> {
  const tabs = await connectTabs();
  if (!(id in tabs)) return false;
  delete tabs[id];
  await chrome.storage.session.set({ [CONNECT_TABS]: tabs });
  return true;
}

/** Is a LeetTrace engine listening? Any reply carrying X-LeetTrace counts (even a 401/403). */
async function findEngine(): Promise<number | null> {
  for (let port = DEFAULT_PORT; port <= DEFAULT_PORT + PORT_SCAN; port++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 800);
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.headers.get('X-LeetTrace')) return port;
    } catch {
      // nothing on this port (or not reachable from here)
    }
  }
  return null;
}

// Installed (or updated) while the app is already running: connect right away, so the very
// first LeetCode visit is already "connected". Engine pages that are open get reloaded (they
// only see this extension after a reload) and send the token themselves.
async function connectOnInstall(): Promise<void> {
  const open = await chrome.tabs.query({ url: 'http://127.0.0.1/*' }).catch(() => []);
  for (const t of open) if (t.id !== undefined) void chrome.tabs.reload(t.id);
  if (open.length > 0 || (await getPairing())) return;
  const port = await findEngine();
  if (port !== null) await openConnectTab(port, false);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/index.html') });
  }
  if (details.reason === 'install' || details.reason === 'update') void connectOnInstall();
});
