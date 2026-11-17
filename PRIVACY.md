# Privacy

Hotswap has no server, no account, no analytics and no AI model. This page says exactly what the extension and the command line touch. Everything here can be checked in the code: there is not one network call in `extension/src/` or `src/` (search for `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`).

## Chrome extension

**Where it runs.** Only on `chatgpt.com`, `chat.openai.com`, `claude.ai` and `gemini.google.com` (the `host_permissions` and `content_scripts` in the manifest). Nowhere else.

**What it reads.** When you press **Capture this chat**, it reads the messages of the open conversation from the page, the same text you see. It does not read other tabs, your history, cookies or passwords.

**What it stores.** Up to 12 capsules and your three settings, in `chrome.storage.local` (this browser profile, this computer). Nothing is synced and nothing is sent. Delete a capsule with the × next to it, or remove the extension, to delete the data.

**What it removes first.** Before a capsule is made, API keys, tokens, private keys and `NAME=value` secrets are replaced with a marker. If that step fails, no capsule is produced. It finds well-known formats and capital-letter `.env`-style names; it is not a guarantee, so read a capsule before you share it.

**What it never does.** It never presses send. It fills the message box (or copies, or downloads) and you press Enter.

**Why each permission exists**

| Permission | Why |
|---|---|
| `storage` | keep your saved capsules and settings on this computer |
| `contextMenus` | the right-click items "capture this chat" and "insert the latest saved capsule here" |
| `clipboardWrite` | the Copy button, and the paste fallback when a site's message box refuses typed text |
| `scripting` | start the Hotswap window on a tab where it did not start by itself (for example a tab opened before the extension was added) |
| the four site hosts | run on those sites only |

**Probe mode** (off by default). A debug switch in the popup. When on, it records, in the same local storage, which selectors matched, which insert technique worked, and the text of a usage-limit banner if one appears. It never records chat text. **Copy probe report** puts that on your clipboard so you can send it to the author if you choose to; nothing is sent for you.

## Command line

`hotswap` reads session files that Claude Code and Antigravity already keep on your computer (`~/.claude/projects`, `~/.gemini/antigravity/brain`), read-only, and writes a capsule or a `HANDOFF.md` where you tell it to. It never opens Antigravity's `.pb` files or its `state.vscdb` (which holds sign-in data). Nothing leaves your machine.

## What you do with a capsule is up to you

A capsule is a Markdown file of your own conversation. When you paste it into another AI, that AI's provider receives it under its own terms. Hotswap cannot control that, so check a capsule before you insert it.

## Contact

Open an issue at https://github.com/blacksinisterx/hotswap/issues.
