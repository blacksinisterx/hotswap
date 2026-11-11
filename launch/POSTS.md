# Hotswap launch posts (LinkedIn + X)

Drafts for **you** to post (posting is your call, not mine). Replace `{REPO}` with the GitHub URL once the repo exists. Every number below is one I measured; the table at the end says how to reproduce each. No claim of being "first" or "better than" anything, no competitor is named.

**Files to attach**
- Video (LinkedIn and X): `docs/media/hotswap-demo.mp4` (1280x720, 47 s, 1.0 MB)
- GIF (X thread first tweet, README): `docs/media/hotswap-demo.gif` (1.2 MB, scenes 1 and 2 only)
- Poster image (LinkedIn cover / link preview): `docs/media/hotswap-poster.png`

The demo is a **terminal replay of the real command output on an invented session** (no real conversation is shown). The caption at the bottom of the video says so; keep it.

---

## LinkedIn post

> I went through my own Claude Code logs and counted: 87 "you've hit your limit" messages across 13 sessions.
>
> Every time, the same problem. The context lives in a long chat, and the moment the limit hits, none of it can be handed to another AI.
>
> So I built Hotswap. It reads a Claude Code or Antigravity session on your own computer and turns it into a capsule: one Markdown file with
>
> - the goal and your latest request
> - open tasks, files changed, last commands, last error
> - the last turns word for word
> - every code block exactly as written, with a hash
> - a fidelity report that says what was cut and why
>
> Drag it into any AI, or run the printed command, and carry on.
>
> What I cared about:
> - No AI model, no server, no account. It is plain code and nothing leaves your machine.
> - It notices the limit. Claude Code writes a line marked rate_limit (HTTP 429) with the reset time; Hotswap watches for it and has the capsule ready.
> - Secrets are removed first. If that step fails, nothing is written.
> - It is checkable: change one word in a capsule and `hotswap check` says so.
> - It is honest about gaps. Antigravity cuts long messages at about 1,000 characters in its own log, so those capsules are labelled "partial".
>
> Before writing any code I read 10 existing context-transfer tools with REA, a code-analysis tool. I could not find one that detects a provider's usage limit and offers the switch, and one sends the whole chat to a server on each use. That gap is the reason this exists.
>
> v0.1 is the local half: 28 tests; a 238 MB session of 1,102 turns became a 41 KB capsule in 2.9 seconds on my machine. A Chrome extension for ChatGPT, Claude and Gemini chats is next.
>
> Code (MIT): {REPO}
> If you try it, tell me what breaks.
>
> #AI #DeveloperTools #OpenSource #ClaudeCode #Antigravity

*(about 1,800 characters; LinkedIn allows 3,000. `node launch/check-posts.mjs` checks every length.)* Post the video as a native upload, not a link. Put the repo link in the post body as above (and again as the first comment, so it is easy to click).

**First comment (pin it):**
> The demo is a terminal replay of the real CLI output on an invented session, so no real chat is shown. Everything in it can be reproduced from `launch/demo/` in the repo. Limits I know about: it does not read ChatGPT/Gemini/Claude.ai chats yet, Antigravity is partial by nature, and nobody except me has used it so far.

---

## X thread (7 posts, each within 280 characters; a link counts as 23)

**1/** *(attach the GIF)*
```
Hit your AI's usage limit mid-task? Your context is stuck in that chat.

I built Hotswap: it turns a Claude Code or Antigravity session into a capsule another AI can pick up from. No AI model, no server, no account.

Demo below. #ClaudeCode #AItools
```

**2/**
```
The capsule is one Markdown file:
- goal + your latest request
- open tasks, files changed, last commands, last error
- the last turns, word for word
- every code block exact, with a hash
- a fidelity report of what was cut

Drag it into any AI.
```

**3/**
```
It notices the limit.

When Claude Code hits its plan limit it writes a line marked rate_limit (HTTP 429) with the reset time. Hotswap watches for that line, builds the capsule, and prints the command to continue elsewhere.

In my own logs: 87 of them across 13 sessions.
```

**4/**
```
Private by design: plain code on your machine. No model, no server, no account.

Keys and tokens are removed first, and if that step fails nothing is written. It never sends anything to another AI by itself.
```

**5/**
```
It is checkable. Every capsule ends with a hash: change one word and `hotswap check` says NOT OK.

And honest: Antigravity cuts long messages at ~1,000 characters in its own log, so Hotswap labels those capsules "partial" instead of pretending.
```

**6/**
```
Before coding I read 10 existing context-transfer tools with REA (code analysis).

None of them detects a provider's usage limit and offers the switch. One sends the whole chat to a server on every use.

That gap is why this exists. #OpenSource
```

**7/**
```
v0.1 is the local half. 28 tests. A 238 MB session (1,102 turns) became a 41 KB capsule in 2.9 s on my machine.

Next: a Chrome extension for ChatGPT / Claude / Gemini chats.

Code (MIT): {REPO}

Try it and tell me what breaks.
```

### One-post version (if you do not want a thread)
```
Hit your AI's usage limit mid-task? Hotswap turns a Claude Code or Antigravity session into one Markdown capsule (goal, open tasks, last turns, exact code) another AI can continue from. No model, no server, no account. Code (MIT): {REPO} #ClaudeCode
```
*(attach the GIF)*

### Reply bank (for questions you are likely to get)
- **"Does it work with ChatGPT or Gemini chats?"** Not yet. v0.1 reads local sessions from Claude Code and Antigravity. A Chrome extension for web chats is the next phase.
- **"Why no LLM summary?"** A summary can invent or drop details. The capsule keeps the real last turns and every code block exactly, and lists what it could not keep. You can still ask the next AI to summarise it.
- **"Is my data safe?"** It runs locally and never uploads anything. Keys and tokens are removed before a file is written, but read `HANDOFF.md` before sharing it: it contains text from your project.
- **"Can the next AI really continue exactly?"** No tool can copy an AI's hidden memory. The capsule carries the visible conversation and working state; the new AI will not behave identically.
- **"Which AIs can read the capsule?"** Any that accepts a text or Markdown attachment or paste. Start commands for Claude Code are verified; Codex, Gemini CLI and Cursor are best-known forms marked "not verified" in the tool.

---

## Before you post (checklist)
1. Create the GitHub repo and push (I will do it as soon as you send the URL). Replace `{REPO}` in the posts.
2. Watch the video once on your phone: the terminal text must be readable.
3. Post at your usual slot (Mon / Wed / Fri 20:00 PKT).
4. Be ready to answer replies the same evening.
5. Do not add numbers I have not listed below; they are the ones that were measured.

## Facts and how to reproduce each one
| Claim in the posts | Where it comes from |
|---|---|
| 87 limit lines in 13 sessions | Count of Claude Code entries with `isApiErrorMessage: true` and a "hit your ... limit" text, across the session files on the author's machine (PHASE0.md section 1). Reproduce on your own: `hotswap watch --once` shows whether the newest session is stuck; the line format is in the README |
| Claude Code writes `rate_limit`, HTTP 429, with the reset time | Same scan: `error: "rate_limit"`, `apiErrorStatus: 429`, text `... resets <time> (<timezone>)` |
| 28 tests | `npm test` |
| 238 MB / 1,102 turns -> 41 KB capsule in 2.9 s | One real capture on the author's machine with `hotswap capture --from claude`; the capsule was deleted afterwards because it contained a private chat |
| Antigravity cuts at about 1,000 characters | In the largest real session 13 of 19 user messages carry the cut marker; lengths cluster near 1,000 (PHASE0.md section 2) |
| 10 existing tools read with REA | 6 closed extensions and 4 open-source repos, listed with hashes and commits in `research/RESEARCH.md` |
| "None detects the provider limit and offers the switch" | Plain-text search of all ten code bases (`research/RESEARCH.md` section 6). It is a statement about what was found in these ten, not about every tool |
| "One sends the whole chat to a server on each use" | One extension POSTs the conversation to a hosted function on every use (`research/RESEARCH.md` section 5). It is not named here on purpose; the finding is from static code, not a runtime test |
| Demo | `launch/demo/` (`make-transcript.mjs` runs the real CLI on an invented session; `record.mjs` and `compose.py` make the video and GIF) |

## Optional: naming the tools (only if you accept the risk)
The research shows which extension sends whole chats to a server, and what each does, with file and line. Naming a product publicly invites a reply from its maker and the findings come from static code reading only. If you choose to, quote only what `research/RESEARCH.md` section 5 says, say "according to its published code", and keep the tone to facts.
