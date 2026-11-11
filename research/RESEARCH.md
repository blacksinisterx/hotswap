# Hotswap research: what existing AI-context tools really do (REA + code reading)

Done 2026-11-12. Everything here comes from files that were downloaded to `research/` and **read as text, never run**. REA (rea-agents 6.7.0, Node 22.23.4) analysed the JavaScript of every target; where REA keeps no data (string literals inside calls, resolved constants), a plain-text search of the same files was used and is labelled as such. Static code facts are not proof of runtime behaviour.

## 1. What was downloaded (so it can be checked)
| Target | Source | Version / commit | Size | Licence |
|---|---|---|---|---|
| dropdat (Chrome extension) | Chrome update service, id `pfcnjelpgccnkagaekhdcddpfacighho` | v0.5.1 | 183,241 B, sha256 `308f64520c941b24…` | not stated |
| ContextSwitch | id `dihbofoieacondcebbkehcjhiafhhomd` | v1.5.1 | 67,320 B, `f8dd15f9b347b7bc…` | not stated |
| Capsule Hub by Tilantra | id `ngeoeefidomejcdhiecidpaalfoekjbh` | v2.17 | 1,447,345 B, `ae435bb7b022c464…` | not stated |
| Context Capsule | id `ikdflhceaeomgmmnkhgpebieamkpbfie` | v1.2.1 | 27,707 B, `f52f2a44622ef7af…` | not stated |
| AIContext Saver | id `nakfngbnigcoegjlochgkeokafkclfmj` | v1.4.0 | 475,153 B, `d6b0e81e3679ffd0…` | none declared |
| LLM Context Bridge | id `bnhhfhomnkpabjchaekdjlagimphdhfl` | v1.0.0 | 29,917 B, `e1fb9e19b30ab1ba…` | not stated |
| Clio | github.com/martymcenroe/Clio | `90e3771` | 8.7 MB repo | MIT |
| gemini-export | github.com/jujusharp/gemini-export | `f18c630` | 0.2 MB | MIT |
| ai-chat-exporter | github.com/amazingpaddy/ai-chat-exporter | `db2c432` | 0.1 MB | Apache-2.0 |
| cli-continues | github.com/yigitkonur/cli-continues | `e486cd2` | 2.7 MB | MIT |
| AIContextCapsule (source of AIContext Saver) | github.com/sharath2525/AIContextCapsule | `80a010d` | 1.7 MB | none declared |

Handling: each package sits in its own folder under `research/downloads/<name>/`, unpacked by `tools/unpack.py` (path-traversal protected), never executed, never loaded into a browser. Repos are shallow clones under `research/repos/`. The closed extensions were studied for ideas only; **no code is to be copied from anything without a licence**.

## 2. How REA was used here, and what it could and could not do
| Target | JS files | REA time | Semantic nodes | Unknowns |
|---|---|---|---|---|
| dropdat | 7 modules | 42.7 s | 28,269 | 9,979 |
| ContextSwitch | 16 modules | 6.0 s | 9,410 | 3,201 |
| Capsule Hub | 664 modules | 83.6 s | 92,553 | 58,338 |
| Context Capsule | 6 modules | 3.8 s | 3,502 | 1,144 |
| AIContext Saver | 30 modules | 7.2 s | 10,379 | 3,608 |
| LLM Context Bridge | 2 modules | 2.8 s | 1,833 | 641 |
| Clio | 22 modules | 15.2 s | 32,029 | 10,684 |
| gemini-export | 45 modules | 23.2 s | 35,573 | 11,792 |
| ai-chat-exporter | 5 modules | 13.5 s | 7,851 | 2,676 |
| AIContextCapsule repo | 39 modules | 8.2 s | 11,220 | 3,930 |

- **Good at:** exact positions (file:line:column) of every use of the browser APIs that matter: `execCommand`, `DataTransfer`, `ClipboardEvent`, `DragEvent`, `InputEvent`, `MutationObserver`, `chrome.contextMenus.create`, `chrome.runtime.sendMessage`, `fetch`; and request endpoints.
- **Not good at:** string literals inside call arguments (so selectors, limit wording and constant URLs were found by a plain-text search instead), and resolving `API_BASE_URL`-style constants (REA reports the template, such as `${API_BASE_URL}/teams/`, not the host). Large minified bundles leave many "unknowns" (Capsule Hub: 58,338); REA lists them instead of guessing.
- **Check that REA agrees with the repo:** AIContext Saver's content script (`widget.js`) gives the same findings at the same positions in the store package and in its GitHub repo (for example `:577:8` `dispatchEvent`), but `popup.js` differs (for example the first `textContent` write is at `499:2` in the package and `769:36` in the repo), so the repo is a different revision from the shipped v1.4.0.
- Raw REA output is about 412 MB, so it is **not** committed; `digest.json` and the scripts in `tools/` reproduce it.

## 3. How each extension gets text into a chat box (the part no repo documents)
All techniques below are evidenced by REA positions and the quoted code.

| # | Technique | Where it is used | Evidence |
|---|---|---|---|
| 1 | **Plain `<textarea>`**: call the native `value` setter, then dispatch `input` and `change` events (the framework only reacts to real events) | LLM Context Bridge | `content.js:306-315` |
| 2 | **contenteditable / ProseMirror (Claude, ChatGPT)**: `focus()`, select the node's contents with a `Range`, `document.execCommand('insertText', false, text)`, then an `InputEvent('input', {inputType:'insertText'})` | ContextSwitch (all sites), LLM Context Bridge | `contextswitch content/claude.js:114-132`; `llmcontextbridge content.js:300-303` |
| 3 | **Gemini (Quill rich-textarea)**: write the clipboard, `execCommand('selectAll')`, `execCommand('paste')`; if the box is still empty, fall back to `insertText` | LLM Context Bridge | `content.js:387-417` |
| 4 | **Files**: rebuild `File` objects from stored blobs, add them to a `DataTransfer`, then dispatch **both** `ClipboardEvent('paste', {clipboardData})` and `DragEvent('drop', {dataTransfer})` on the composer | dropdat | `content-scripts/chatgpt.js` (function `ce`) |
| 5 | **MAIN-world inserter scripts per site**, so the code can reach the page's own framework objects, plus a CSS **privacy mask** that hides the injected context text from the visible chat | Capsule Hub (`claude-inserter.js`, `gemini-inserter.js`, `notebooklm-inserter.js`, ...) | `manifest.json` `world: MAIN`; `claude-inserter.js:1-60` |
| 6 | Wait for the input to exist with a `MutationObserver` (timeout 15 s), then act | LLM Context Bridge | `content.js:319-330` |
| 7 | **Auto-send** by clicking the site's send button or a synthetic Enter | LLM Context Bridge | `content.js:332-345`. **Hotswap will not do this.** |

Take-away: the proven ladder per site is **(a)** native setter for textareas, **(b)** select-all + `insertText` + `InputEvent` for contenteditable, **(c)** clipboard + paste for Gemini, **(d)** `File` + `DataTransfer` + paste and drop for attachments, with a visible fallback to "copied to clipboard" when none works. Each site still needs real testing (Phase 0b).

## 4. How they read a chat (and why they break)
- **ContextSwitch** guesses with generic class fragments (`[class*="human-message"]`, `.prose`, alternating roles when it cannot tell). Four fallback methods in one function; on a layout change it can silently produce a wrong role order. (`content/claude.js:18-89`)
- **Clio** is the careful one: dated selector files, old and new selectors kept side by side, saved-HTML fixtures per DOM era, completeness flags. Its notes record that **ChatGPT replaced its thread markup wholesale on 2026-10-17**: no element has `data-message-author-role` or `.markdown` any more; the message boundary is now `[data-chatgpt-search-unit-key="<k>:<n>:user|assistant"]` inside `[data-turn-key]`, with text in `.whitespace-pre-wrap` and `[data-markdown-text-style]` (`selectors-chatgpt.js:1-40`).
- Competitors that depend on the old attribute (for example the order of `h5.sr-only` / `h6.sr-only` in ai-chat-exporter) are therefore likely stale; that is an inference from Clio's notes, not tested.

## 5. Do the products do what their listings say? (privacy audit from code)
| Product | Listing says | The code shows |
|---|---|---|
| **dropdat** | Local-first; free; its other page says capsules sync to a server database backed by an account | Capsules are stored in the extension; there is a **sync client** talking to `https://dropdat.app` (`/api/v1/capsules/...`, `/attachments`) using a `dropdat_api_key` kept in `chrome.storage`; permissions include the sign-in provider's hosts. Whether sync is on by default is not visible statically. **It has a right-click menu**: `chrome.contextMenus.create` (title "dropdat", folder submenu). |
| **ContextSwitch** | Local saves; server only when you compress | Google sign-in through `chrome.identity.launchWebAuthFlow`; `POST ${API_URL}/compress`, `/improve-prompt`, `/auth/google`, `/user/stats`, `/user/track-save`. Its handoff prompt text begins "I've switched sessions due to rate limits. The above is my COMPLETE conversation history...". It also has a per-site **token meter** (`content/token-meter.js`) with assumed budgets; that is a size estimate, **not** detection of a provider limit. |
| **Capsule Hub** | Library, teams, versions | `backend.tilantra.com` with `/users/auth/google`, `/teams/`, `/capsules/attachments/...`; `identity` permission; per-site inserters; its "limit reached" message is its own **plan limit** ("Capsule creation limit reached. Please upgrade your tier"). |
| **Context Capsule** | "No account required", structured summary | On each use it **POSTs the whole conversation** (`{ messages }`) to a Supabase edge function, `.../functions/v1/generate-capsule` (`content/inject.js:15-17,134`), and posts feedback to `.../rest/v1/feedback`. No account, but the chat leaves the browser. |
| **AIContext Saver** | Runs in the browser; "Smart" summary | "Smart" calls a **user-configured OpenAI-compatible `/chat/completions`** endpoint with the user's own API key (`utils/summarize.js:81-100`). Raw mode is local. The content script matches its GitHub repo; the popup differs (different revision). |
| **LLM Context Bridge** | One-click transfer | No network endpoints found; only `storage`. It does **auto-send** the pasted context. |

This confirms a real gap for Hotswap's promise: **no LLM, no server, no account** is not what most of these do.

## 6. Limit detection: confirmed missing
Plain-text search for limit wording across all ten targets found **only**: their own plan or quota messages (Capsule Hub, ContextSwitch's "Monthly limit reached"), sync-storage quotas (dropdat), or an API key's own rate limit (AIContext Saver). **None detects "the AI provider's limit was reached" on a chat page.** cli-continues recognises rate-limit notices only to *skip* them when finding the last real reply (`parsers/claude.ts:533-548`, `commands/inspect.ts:247-252`); it does not trigger a switch. The only real limit text we hold is from Claude Code on this PC (see `PHASE0.md`).

## 7. Local coding-agent tools: facts verified in cloned source (cli-continues)
- Reads Claude Code `~/.claude/projects/**.jsonl`, Codex, Copilot, Gemini, OpenCode, Cursor and others; Antigravity through `~/.gemini/antigravity` (`brain/<id>/*.md`, `state.vscdb` key `antigravityUnifiedStateSync.trajectorySummaries`, and a live language-server RPC). The `.pb` conversations are listed by id only; **their content is not decoded**.
- The live-RPC route returns no ports on Windows (`src/parsers/antigravity.ts:909`: `if (!pid || process.platform === 'win32') return [];`). That tool therefore cannot use the RPC route here. Hotswap can: see `PHASE0.md`.
- Has tests and `test-fixtures/`. Presets: minimal, standard, verbose, full. No LLM.
- Other tools from the earlier survey (casr, handoff, agent-chorus, session-sync, dotbabel) were read at README and partial-source level only.

## 8. What we reuse, and under what licence
| Idea | From | Rule |
|---|---|---|
| Capture while scrolling into a cache keyed by message id; rescue nodes removed in the same mutation batch; completeness flags; dated selectors; saved-HTML fixtures per DOM era | Clio (MIT) | Adapt with the MIT notice kept; write our own fixtures from our own chats |
| One config object per platform feeding a shared extractor | gemini-export (MIT) | Same |
| Injection technique ladder (section 3) | Observed in several products | These are standard browser techniques; write our own code |
| Right-click menu, file-based capsule, drag onto composer | dropdat (no licence) | Ideas only; no code copied |
| Presets by size; deterministic handoff markdown | cli-continues (MIT) | Ideas and, if needed, small adaptations with notice |

## 9. Corrections to the earlier plan
1. **"Right-click is a gap" is withdrawn.** dropdat registers a context menu. Our right-click value is smaller: capture *and* insert from the menu, on the web and for local tools.
2. **ChatGPT selectors changed on 2026-10-17** (Clio). Any reader must be built on the new markup and tested on dated fixtures.
3. **Most "smart" capsules use a server or an LLM**, which makes the deterministic, local, no-account design a real difference, not just a preference.
4. **Limit detection is genuinely unbuilt** on the web; locally it is possible for Claude Code today.
5. **Antigravity on Windows**: the RPC route that existing tools use does not work; the offline route is different (see `PHASE0.md`).

## 10. Open items this research could not settle
- The wording of **web chat limit screens** (Claude.ai, ChatGPT, Gemini). No competitor contains it and none was captured here; it must be collected from real limit screens.
- Whether dropdat sync is **off by default**.
- How each site reacts to the injection ladder; needs live testing on a throwaway chat.
- Capsule Hub's `huggingface.co` entry in its content-security policy; the code searched did not show how it is used.
