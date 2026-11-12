"use strict";
(() => {
  // extension/src/shared/storage.ts
  var DEFAULTS = { preset: "standard", probe: false, limitHints: true };
  async function getSettings() {
    const r = await chrome.storage.local.get("settings");
    return { ...DEFAULTS, ...r.settings };
  }
  var setSettings = (s) => getSettings().then((cur) => chrome.storage.local.set({ settings: { ...cur, ...s } }));
  async function listCapsules() {
    const r = await chrome.storage.local.get("capsules");
    return r.capsules ?? [];
  }
  async function deleteCapsule(id) {
    await chrome.storage.local.set({ capsules: (await listCapsules()).filter((x) => x.id !== id) });
  }

  // extension/src/popup/popup.ts
  var $ = (id) => document.getElementById(id);
  async function activeTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }
  var tell = async (msg) => {
    const id = await activeTabId();
    if (id) await chrome.tabs.sendMessage(id, msg).catch(() => alert("Open a ChatGPT, Claude or Gemini chat first."));
  };
  async function render() {
    const list = await listCapsules();
    const box = $("list");
    box.replaceChildren();
    if (!list.length) {
      box.textContent = "Nothing saved yet.";
      box.className = "hint";
      return;
    }
    box.className = "";
    for (const c of list) {
      const row = document.createElement("div");
      row.className = "item";
      const t = document.createElement("div");
      t.className = "t";
      const a = document.createElement("div");
      a.textContent = c.title || "Untitled";
      const b = document.createElement("small");
      b.textContent = `${c.site} \xB7 ${c.tier} \xB7 ${(c.bytes / 1024).toFixed(0)} KB`;
      t.append(a, b);
      const act = document.createElement("div");
      act.className = "row";
      const mk = (label, fn) => {
        const x = document.createElement("button");
        x.textContent = label;
        x.addEventListener("click", fn);
        act.append(x);
      };
      mk("Insert", () => void tell({ type: "hotswap:insert", id: c.id }));
      mk("Copy", () => void navigator.clipboard.writeText(c.text));
      mk("\xD7", () => void deleteCapsule(c.id).then(render));
      row.append(t, act);
      box.append(row);
    }
  }
  $("open").addEventListener("click", () => void tell({ type: "hotswap:open" }).then(() => window.close()));
  void getSettings().then((s) => {
    $("preset").value = s.preset;
    $("hints").checked = s.limitHints;
    $("probe").checked = s.probe;
  });
  $("preset").addEventListener("change", (e) => void setSettings({ preset: e.target.value }));
  $("hints").addEventListener("change", (e) => void setSettings({ limitHints: e.target.checked }));
  $("probe").addEventListener("change", (e) => void setSettings({ probe: e.target.checked }));
  void render();
  chrome.storage.onChanged.addListener(() => void render());
})();
