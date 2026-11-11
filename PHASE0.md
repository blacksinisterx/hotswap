# Phase 0 spike: what is really on this PC (Windows 11)

Run 2026-11-12, read-only. **Verdict: GO** for the Claude Code reader and limit watcher, GO with a "partial fidelity" label for Antigravity.

## What was opened, and what was printed (so you can check)
- Listed folder and file **names and sizes** under `~/.claude/projects`, `~/.gemini/antigravity`, `%APPDATA%/Antigravity/User/globalStorage`.
- Claude Code: read all 147 session files in memory; printed **only counts, key names, and the system-generated error text** of entries flagged as API errors. No chat text was printed.
- Antigravity `overview.txt` (4 files): printed key names, step types, tool names, string lengths and counts. No chat text was printed.
- Antigravity `conversations/*.pb`: read the first 64 KB of 5 files to compute randomness (entropy) and the first 8 header bytes. No content decoded.
- Antigravity `state.vscdb` (SQLite): opened **read-only**; printed table names, key names and value lengths. **No values were read**, and in particular the keys `antigravityUnifiedStateSync.oauthToken` and `antigravityAuthStatus` were left alone.
- The helper scripts are in the session scratchpad; nothing was written to your tool folders.

## 1. Claude Code (works)
- **Where:** `~/.claude/projects/<project-folder>/<session-id>.jsonl` (plus sub-agent files). 14 project folders, 147 JSONL files, 822 MB.
- **Format:** one JSON object per line. Entry `type` values seen: `user`, `assistant`, `system`, `attachment`, `queue-operation`, `last-prompt`, `custom-title`, `agent-name`, `file-history-snapshot`, `mode`, and several internal ones. Common keys: `sessionId`, `timestamp`, `cwd`, `gitBranch`, `slug`, `version`, `uuid`, `parentUuid`, `isSidechain`, `message{role, content, model, usage, stop_reason}`, `toolUseResult`.
- **What this gives the capsule for free:** working folder (`cwd`), git branch, session title (`custom-title`), the real message order, tool calls and results, and files touched.
- **The limit is machine-detectable.** When the plan limit is hit, Claude Code writes a normal-looking assistant line with these markers:
  - `isApiErrorMessage: true`, `error: "rate_limit"`, `apiErrorStatus: 429`, `message.model: "<synthetic>"`
  - text of the form `You've hit your session limit · resets <time> (<timezone>)`
  - On this PC: **87 such entries in 13 sessions**; every one has a `resets <time>` part.
  - Other API errors use other values (`server_error`, `authentication_failed`, `invalid_request`), so they can be told apart from a limit.
- **Consequence:** a local Limit Watcher for Claude Code needs no guessing: watch the newest session file for a line with `error == "rate_limit"`, read the reset time from the text, and show "Switch now" with a ready capsule.

## 2. Antigravity (works partly, and not the way the forum posts said)
Folder: `~/.gemini/antigravity/` (142 MB, 1,661 files: mostly screenshots).

| Item | What it is | Usable? |
|---|---|---|
| `conversations/<id>.pb` (21 files, up to 27 MB) | **Random-looking bytes** (entropy 8.0 bits per byte, no readable header). Not plain protobuf; treated as encrypted or compressed. | **No.** Nobody decodes these offline, and we will not try. |
| `brain/<id>/.system_generated/logs/overview.txt` (4 files here, 6 KB to 227 KB) | **JSON Lines**, one step per line. Keys: `step_index`, `source` (`USER_EXPLICIT` / `MODEL`), `type` (`USER_INPUT`, `PLANNER_RESPONSE`, `CODE_ACTION`, `VIEW_FILE`), `status` (`DONE` / `CLEARED`), `created_at`, `content`, `tool_calls[{name, args}]`. | **Yes: this is the offline transcript.** |
| `brain/<id>/task.md`, `implementation_plan.md`, `walkthrough.md` (+ `.metadata.json`, `.resolved*`) | The agent's own plan and progress documents | **Yes**, and very useful for the state card |
| `annotations/<id>.pbtxt` (6) | text protobuf, per conversation | Not examined (probably UI annotations) |
| `%APPDATA%/Antigravity/User/globalStorage/state.vscdb` | SQLite, table `ItemTable`. Has `antigravityUnifiedStateSync.trajectorySummaries` (32 KB) | Possibly a conversation index; value not opened. **Also holds OAuth and auth-status keys: Hotswap must never read them.** |

Important limits of the `overview.txt` route, measured:
- **Message text is cut at about 1,000 characters.** In the 4 logs, user inputs have a median of 990 and a maximum of 1,034 characters; planner replies top out at 1,040. Long messages are therefore **truncated by Antigravity itself**.
- 170 of 578 steps have status `CLEARED`, which suggests some step detail is dropped.
- Only 4 of the conversations have an `overview.txt` here, although 21 `.pb` files exist.
- So for Antigravity the honest tier is **Partial**: the real conversation flow, user requests (to about 1,000 characters each), the agent's plan and walkthrough documents, the tools it ran (`view_file`, `run_command`, `grep_search`, `replace_file_content`, `write_to_file`, ...) and the files it touched. Not full verbatim.

The live-RPC route used by other tools needs the language-server port; the largest existing tool returns no ports on Windows, and we do not need it.

## 3. Decisions this settles
1. **Claude Code reader and Limit Watcher: GO**, fully deterministic.
2. **Antigravity reader: GO**, from `overview.txt` + brain markdown, labelled **Partial** in the fidelity report. No `.pb`, no RPC, no `state.vscdb` values.
3. A user can raise fidelity for Antigravity by pasting the long message again or exporting from its UI; the capsule says which messages were cut.
4. **Never touch auth data.** Any reader that opens `state.vscdb` must open it read-only and read only named, non-secret keys.
5. Web limit wording and composer injection still need Phase 0b on real pages (see `research/RESEARCH.md`, section 10).
