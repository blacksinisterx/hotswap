// Right-click menu: capture this chat, or insert the latest saved capsule into the message box under the cursor.
declare const __DEV__: boolean;

const HOSTS = ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'];
const PATTERNS = __DEV__ ? [...HOSTS, 'http://127.0.0.1/*', 'http://localhost/*'] : HOSTS;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'hotswap-capture', title: 'Hotswap: capture this chat', contexts: ['page', 'selection', 'editable'], documentUrlPatterns: PATTERNS });
    chrome.contextMenus.create({ id: 'hotswap-insert', title: 'Hotswap: insert the latest saved capsule here', contexts: ['editable', 'page'], documentUrlPatterns: PATTERNS });
  });
});

// Sends a message to the page's content script. If nothing answers (the script never started on that tab, for example because
// the tab was opened before the extension was added, or the site blocked it), it is injected now and the message is sent again.
export async function tellTab(tabId: number, msg: object): Promise<boolean> {
  try { await chrome.tabs.sendMessage(tabId, msg); return true; } catch { /* no listener yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise((r) => setTimeout(r, 400));
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch { return false; }
}

chrome.runtime.onMessage.addListener((msg: { type?: string; tabId?: number; payload?: object }, _sender, reply) => {
  if (msg?.type === 'hotswap:tell' && msg.tabId && msg.payload) { void tellTab(msg.tabId, msg.payload).then(reply); return true; }
  return undefined;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const type = info.menuItemId === 'hotswap-capture' ? 'hotswap:capture' : info.menuItemId === 'hotswap-insert' ? 'hotswap:insert-latest' : null;
  if (type) void tellTab(tab.id, { type });
});
