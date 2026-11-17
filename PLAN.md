# Hotswap: switch AI mid-task without losing the thread (plan v3, evidence-based)

Plan v3, 2026-11-12. v2 was written from web research; v3 is rewritten after reading real code with REA (`research/RESEARCH.md`) and inspecting this PC (`PHASE0.md`). Still **no product code**: only research and plans so far.

## 1. The use case
You are in the middle of a critical task, the AI says "limit reached", and you must continue elsewhere **now**.
1. **Detect** the limit (or press a button).
2. **Capture** a *capsule* of the work (right-click or button). It is prepared in advance, so there is nothing to wait for.
3. **Resume** in another AI: drag the capsule in, or run one command for a local agent.

## 2. What "accurately" means (three honest tiers, shown on every transfer)
| Tier | What travels | Promise |
|---|---|---|
| **Verbatim** | Real messages and every code block, byte for byte | Exact; checked by counts and hashes |
| **Hybrid** (default) | State card + last N messages verbatim + all final code blocks verbatim | Exact where it matters, short enough to fit |
| **Partial** | Whatever the source tool itself keeps | Said plainly. **Antigravity is Partial**: its own log cuts each message at about 1,000 characters (`PHASE0.md`) |

No hidden reasoning, no "the new AI will behave identically". A **fidelity report** follows every transfer: messages read and sent, code blocks matched, what was cut and why. No accuracy percentage is printed unless it was measured on a test set.

## 3. The competition, in one table (full evidence in `research/RESEARCH.md`)
| Who | What they do | What the code shows |
|---|---|---|
| dropdat | Capsule button, drag onto composer, right-click menu, MCP for coding agents | Sync client to its own server; files injected with `DataTransfer` + paste + drop |
| Capsule Hub | Library, teams, versions | Account and backend server; per-site MAIN-world inserters |
| ContextSwitch | Save, load full or compressed | Google sign-in; compression on a server; a handoff text that mentions rate limits but **no detection** |
| Context Capsule | One-click structured summary | Sends the **whole conversation** to a Supabase function on every use |
| AIContext Saver | Raw or Smart capsule | Smart needs the user's own API key |
| LLM Context Bridge | Move a chat | Local only; **auto-sends** |
| cli-continues (1.6k stars, MIT) | Local agents to local agents, 16 tools incl. Antigravity | Antigravity via RPC that returns no ports on Windows; `.pb` not decoded |
| Clio (MIT) | Best web exporter engineering | Dated selectors, fixtures, completeness flags; ChatGPT markup changed on 2026-10-17 |

### Where Hotswap can honestly be better (verified in code, not just listings)
| Gap | Evidence |
|---|---|
| **No LLM, no server, no account**, still structured | Most "smart" capsules send the chat to a server or need an API key |
| **Limit-aware**, with a capsule already waiting | None of 10 code bases detects a provider limit; they only show their own plan limits |
| **Web and local in one tool, one capsule format** | Web extensions and CLI tools are separate worlds |
| **Antigravity on Windows, offline** | Existing tools cannot read it here; `overview.txt` + brain files can |
| **Fidelity report + completeness flags** on every transfer | Only Clio flags completeness, and only for export |

Withdrawn from v2: "right-click is a gap". dropdat has a context menu, so it is a feature to match, not a differentiator.

## 4. Decisions made by Aiza
Chrome first. All web AIs over time (ChatGPT, Claude, Gemini first). All local tools over time. **No LLM anywhere.** Distribution: GitHub repo and releases, people clone or download the zip and "Load unpacked". Name: **Hotswap**. First target (MVP): web-to-web capsule plus local `hotswap to claude`, with limit auto-detection next.

## 5. The capsule (deterministic, readable, draggable)
A single file `name.hotswap.md` that a human can read and any AI can take as an attachment, with an embedded JSON block so Hotswap can parse it back.
- **State card**: goal (first user message + anything the user pinned), the latest request, open to-dos (checkbox lines and task-tool entries), files touched, commands run and the last result, last error. Each line cites the message it came from.
- **Verbatim tail**: the last N messages.
- **Code vault**: every code block's final version with its hash.
- **Attachments list**: names, and what could not be carried.
- **Provenance**: source tool, session id, time, completeness flags, whole-capsule hash.
- Size presets instead of AI summaries: minimal, standard, verbose, full, plus a per-target cap from a config table.

For Claude Code the state card gets `cwd`, git branch, session title, tool calls and touched files straight from the session file. For Antigravity it also uses `task.md`, `implementation_plan.md` and `walkthrough.md`.

## 6. Architecture
```
 SOURCES                              CORE (TypeScript, no LLM)                       TARGETS
 -------                              -------------------------                       -------
 ChatGPT / Claude / Gemini tabs --\                                            /--> insert into composer (ladder below)
 (content scripts, Clio-style)     \   Limit Watcher --> "Switch?" prompt     /---> attach as .md file
 Claude Code .jsonl ----------------->  Capsule builder (state card, vault,   ----> HANDOFF.md + start command
 Antigravity overview.txt + brain --/   redactor, fidelity report)             \--> (later) native session writer
 Codex / Gemini CLI / Cursor -------/   Capsule store (IndexedDB / files)
```
1. **Core library** (pure TypeScript): schema, redactor, builder, fidelity report. Runs in the extension and in Node.
2. **Chrome extension (MV3)**: per-site content scripts, service worker, side panel, `contextMenus`, local storage only, no backend.
3. **Local helper**: CLI `hotswap` plus a **Native Messaging host** so the extension can read local sessions (a browser cannot read `~/.claude`).

### 6.1 Limit Watcher
- **Claude Code (known, deterministic):** watch the newest session file for a line with `isApiErrorMessage: true` and `error: "rate_limit"` (HTTP 429), and read `resets <time> (<timezone>)` from its text. On this PC there are 87 such lines in 13 sessions; other API errors use other values, so they are not mistaken for limits.
- **Antigravity (unknown):** no limit entries were found in its logs; the one text match for limit-like words is unverified. Ships as manual until real limit wording is observed.
- **Web chats (unknown):** no competitor contains the wording and none was captured. Ships with the manual **Switch now** button; rules are added from real limit screens as soon as they are seen. A generic "looks like a limit" rule may be offered, labelled experimental.
- **Pre-emptive capsule:** a fresh capsule is kept after each reply, so a limit never finds you with nothing.
- On detection: a small non-blocking prompt "Limit reached. Resets at 11:40. Switch to Claude / ChatGPT / Gemini / Codex?" Never sends anything by itself.

### 6.2 Readers (sources)
| Source | Route | Status |
|---|---|---|
| **Claude Code** | `~/.claude/projects/<project>/*.jsonl` | **Verified on this PC.** Entry types and keys known. |
| **Antigravity** | `~/.gemini/antigravity/brain/<id>/.system_generated/logs/overview.txt` (JSON Lines) + `brain/<id>/*.md`. Not the `.pb` files (random-looking bytes), not the RPC, and never the auth keys in `state.vscdb`. | **Verified on this PC.** Tier: Partial (messages cut at about 1,000 characters). |
| Codex CLI | `~/.codex/sessions/**/rollout-*.jsonl` | From other tools' READMEs; verify when built |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.json[l]` | Same |
| Cursor | `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` | Same |
| **Web chats** | Content script reads the visible page: scroll to load history, cache by message id, rescue removed nodes, completeness flags (Clio's design, MIT). Selectors for ChatGPT's **post-2026-10-17** markup. Dated selector files, saved-HTML fixtures from our own chats, self-test. | Design proven in Clio; our adapters to build |

### 6.3 Writers (targets)
The **injection ladder** (observed in several products, to be re-tested per site):
1. `<textarea>`: native `value` setter, then `input` and `change` events.
2. contenteditable (Claude, ChatGPT): focus, select the contents, `document.execCommand('insertText')`, then an `InputEvent`.
3. Gemini: write the clipboard, `execCommand('paste')`; fall back to `insertText`.
4. Attachments: `File` + `DataTransfer`, dispatch `paste` and `drop`.
5. If all fail: copy to the clipboard and say so on screen.
**Never auto-send**: the user presses Enter. (LLM Context Bridge auto-sends; we will not.)

- **Right-click:** "Capture this chat as capsule" on a page, "Insert capsule here" on a composer (`contextMenus`), plus the same from the extension chip and by dragging the chip onto the composer.
- **Local agent:** write `HANDOFF.md` into the project and print or run the start command ("Read HANDOFF.md, then continue"); optional pointer in `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` only after confirmation.
- **Later:** native session writers (stretch, built from scratch; casr's licence has a rider).

## 7. Privacy and safety rules
No server, no account, no telemetry. A redactor scans every export (API keys, tokens, `.env`, private keys), shows what it would remove, and **fails closed** if it cannot run. Local sources are opened read-only; **auth and token data are never read** (for example the OAuth keys in Antigravity's `state.vscdb`). Nothing is sent to an AI without the user pressing Enter. Minimal permissions: only the supported sites; the local helper is opt-in and states which folders it reads.

## 8. Licences and rules for reuse
MIT (Clio, gemini-export, cli-continues) and Apache-2.0 (ai-chat-exporter): adaptation allowed with notices kept. Anything without a licence (dropdat, Capsule Hub, ContextSwitch, Context Capsule, AIContext Saver, Trifall/chat-export): **ideas only, no code**. casr: licence rider, write our own. Site terms of service: stay with visible page content and local files; no undocumented site APIs by default. Not legal advice.

## 9. Research status
- **Done, with REA:** 6 closed extensions and 4 open-source repos analysed (`research/RESEARCH.md`): injection techniques with positions, privacy audit, limit-detection check, licence map.
- **Done, on this PC:** Claude Code and Antigravity formats, limit entries (`PHASE0.md`).
- **Still unknown:** web limit-screen wording; how each site reacts to the injection ladder; whether dropdat sync is off by default. These are settled by **Phase 0b** inside the extension itself (below), not by guessing.

## 10. Build plan (about 3 weeks part-time)
| Phase | Days | Done means |
|---|---|---|
| ~~R. Research with REA~~ | done | `RESEARCH.md` |
| ~~0. Local spike~~ | done | `PHASE0.md` |
| ~~1. Core + local flow~~ | **done (v0.1)** | Capsule schema, redactor, builder, **Claude Code reader**, **Antigravity reader (Partial)**, `hotswap to <claude|codex|gemini>` writing `HANDOFF.md`, **Claude Code Limit Watcher**. Tests on sanitised copies of real sessions. |
| **2. Chrome extension** | 4 to 5 | ChatGPT, Claude, Gemini readers (Clio-style, new ChatGPT markup), capsule chip, drag to composer, right-click, injection ladder, fixtures and self-tests. |
| **0b. Probe mode (inside phase 2)** | 1 | A debug panel that records which injection step worked per site and saves the text of any limit banner you hit, so the unknowns above are settled from your real use and the results can be shared. |
| **3. Web Limit Watcher + bridge** | 2 to 3 | Rules from real limit screens, Native Messaging so the extension reads local sessions, "Switch?" prompt. |
| **4. More adapters** | 2 to 3 | Codex, Gemini CLI, Cursor; Grok, Copilot, Perplexity, DeepSeek. |
| **5. Ship** | 2 | README with measured results only, demo GIF, privacy page, GitHub release zip with "Load unpacked" steps. |

**MVP:** (a) on Claude.ai, ChatGPT or Gemini: capture a capsule with one click or right-click, drag it into another of the three, conversation continues; (b) `hotswap to claude` from a Claude Code or Antigravity session, with the Claude Code limit prompt. Web limit auto-detection follows once real limit screens are captured.

## 11. Tests and claims
Round trip on fixtures (message counts equal, code-block hashes identical); adapter fixtures per site per DOM era with a visible "adapter broken" notice; completeness flags on every export; redactor catches planted fake secrets; Claude Code limit rule tested on saved real entries (87 here) and on normal sessions for false alarms. We may claim "N of N code blocks identical across M sessions" only after measuring.

## 12. Risks
1. Crowded space: win only on the gaps in section 3, so they must actually be delivered.
2. Web markup changes (ChatGPT changed it on 2026-10-17): fixtures, dated selectors, self-tests.
3. Antigravity's own cut-off of long messages cannot be undone: reported as Partial.
4. Injection per site is unproven until probe mode runs; fallback is the clipboard.
5. Web limit wording unknown until seen; manual button always works.
6. No-LLM capsules are less "smart": answered by verbatim tail, code vault, user pins.
7. Site terms of service; Chrome Web Store not used (no fee), so distribution is GitHub only.

## 13. Status and next step
**Done:** Phase 1 (CLI: Claude Code and Antigravity readers, redactor, capsule, limit watcher), Phase 2 and 0b (Chrome extension for ChatGPT, Claude and Gemini with probe mode, mascot UI, real-site fixes), Phase 5 (privacy page, committed build, `npm run package:extension`, demo videos, launch posts). Verified on real pages: ChatGPT and Gemini signed out (capture, save, insert), ChatGPT signed in (the author's own check). Experimental readers for Codex CLI and Gemini CLI exist, tested on invented sessions only.

**Still open, and why:**
- claude.ai: not tested (sign-in and a Cloudflare check).
- Web limit detection: the rules are guesses until a real limit banner is captured (probe mode saves its text).
- Phase 3 bridge (Native Messaging so the extension reads local sessions): not built.
- More sites (Grok, Perplexity, Copilot, DeepSeek): Copilot and DeepSeek need a sign-in; Grok and Perplexity open signed out but each needs a real test chat, which needs the author's say-so per site.
- Cursor: chats live in an app database that also holds sign-in data; not read.
- Codex and Gemini CLI readers: need a real session from someone who uses those tools.
