// Background service worker. Its one job: read the code from LeetCode's Monaco editor,
// which lives on the page's `window` (MAIN world) where content scripts can't reach.
import { readMonacoInPage } from '../content/leetcodePage';

chrome.runtime.onMessage.addListener((msg: { type?: string }, sender, sendResponse) => {
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
});
