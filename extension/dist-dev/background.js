"use strict";
(() => {
  // extension/src/background.ts
  var HOSTS = ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*", "https://gemini.google.com/*"];
  var PATTERNS = true ? [...HOSTS, "http://127.0.0.1/*", "http://localhost/*"] : HOSTS;
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: "hotswap-capture", title: "Hotswap: capture this chat", contexts: ["page", "selection", "editable"], documentUrlPatterns: PATTERNS });
      chrome.contextMenus.create({ id: "hotswap-insert", title: "Hotswap: insert the latest saved capsule here", contexts: ["editable", "page"], documentUrlPatterns: PATTERNS });
    });
  });
  async function tellTab(tabId, msg) {
    try {
      await chrome.tabs.sendMessage(tabId, msg);
      return true;
    } catch {
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await new Promise((r) => setTimeout(r, 400));
      await chrome.tabs.sendMessage(tabId, msg);
      return true;
    } catch {
      return false;
    }
  }
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "hotswap:tell" && msg.tabId && msg.payload) {
      void tellTab(msg.tabId, msg.payload).then(reply);
      return true;
    }
    return void 0;
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const type = info.menuItemId === "hotswap-capture" ? "hotswap:capture" : info.menuItemId === "hotswap-insert" ? "hotswap:insert-latest" : null;
    if (type) void tellTab(tab.id, { type });
  });
})();
