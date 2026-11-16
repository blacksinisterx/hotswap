# Hotswap Chrome extension launch posts (LinkedIn + X)

Drafts for **you** to post (posting is your call, not mine).  Every claim below is something I ran or measured; the table at the end says where each comes from. No claim of being "first" or "better than" anything, no competitor is named. These posts are about the **Chrome extension**; the CLI posts are in `POSTS.md`.

**Files to attach**
- Video (LinkedIn and X): `docs/media/hotswap-real-demo.mp4` (1280x804, 60 s, 1.6 MB). It was recorded on the **real** chatgpt.com and gemini.google.com, not signed in. Captions are burned in.
- GIF (X first tweet, README): `docs/media/hotswap-real-demo.gif` (3.9 MB)
- Mascot image (LinkedIn cover or second image): `docs/media/hotswap-mascot-moods.png`

What the video shows: one generic prompt sent on ChatGPT, Capture, Save, then real Gemini, Insert here. Nothing is sent after the insert; the caption says so. Keep it.

---

## LinkedIn post

> Your AI hits its usage limit in the middle of a task. The context is stuck in that chat.
>
> So I made Hotswap a Chrome extension. A small flame-headed capsule sits on the page of ChatGPT, Claude or Gemini. Click it:
>
> 1. Capture this chat. It scrolls to the start, reads the real messages and keeps every code block exactly as written.
> 2. Save it, or copy it, or drag it.
> 3. Open another AI, press Insert here. The whole chat is in the message box. You read it and press Enter.
>
> What I cared about:
> - No AI model, no server, no account. It is plain code and everything stays in your browser.
> - It never presses send for you.
> - Secrets (keys, tokens, .env lines) are removed before the capsule is made; if that step fails, nothing is produced.
> - The capsule says what it could not read, instead of pretending.
>
> The part I want to be upfront about: I wrote the first version against notes about how these sites are built, and tests on pages that copy their structure. Then I ran it on the real sites. It found three bugs the tests could not: ChatGPT's markup had already changed, ChatGPT scrolls the whole page instead of a box, and Gemini's message box is a plain textarea when you are signed out. All fixed, and the demo video is recorded on the real sites.
>
> What is still unproven: claude.ai (I could not test it myself), the usage-limit detection (experimental; I have not seen a real limit banner yet), and anyone's setup except mine.
>
> Code (MIT): https://github.com/blacksinisterx/hotswap
> Load it in Chrome with "Load unpacked". If it breaks on your chat, a probe mode in the popup records what failed without recording your chat text. Send me that.
>
> #AI #ChromeExtension #DeveloperTools #OpenSource #ChatGPT #Gemini #Claude

*(Post the video as a native upload. Put the repo link in the post body and again as the first comment.)*

**First comment (pin it):**
> The demo is real ChatGPT and real Gemini, signed out, with one generic prompt (a Python string reverse). No personal chat is shown. Reproduce it with `launch/extension-demo/record-real.mjs`. Not verified: claude.ai, signed-in versions of every site, and the limit banner wording.

---

## X thread (6 posts, each within 280 characters; a link counts as 23)

**1/** *(attach the GIF)*
```
Hit your AI's usage limit mid-task? Your context is stuck in that chat.

Hotswap is a Chrome extension: a little flame-headed capsule on ChatGPT, Claude and Gemini that captures the chat and drops it into another AI. No model, no server, no account.
```

**2/**
```
Click the capsule:

1. Capture this chat (it scrolls to the start, keeps code exactly)
2. Save
3. Open another AI, press Insert here

The whole chat lands in the message box. It never presses send. You read it and hit Enter.
```

**3/**
```
Secrets (keys, tokens, .env lines) are removed before the capsule exists. If that step fails, nothing is produced.

Everything stays in your browser. The capsule says what it couldn't read instead of pretending.
```

**4/**
```
I wrote it against notes and tests on pages that copy each site's structure. Then I ran it on the real sites and it found 3 bugs the tests couldn't:

ChatGPT's markup had changed
ChatGPT scrolls the whole page
Gemini's box is a plain textarea signed out
```

**5/**
```
All fixed. The demo video is recorded on real ChatGPT and real Gemini (signed out, one generic prompt).

Not proven yet: claude.ai, the limit-banner detection (experimental), and anyone's setup but mine.
```

**6/**
```
Code (MIT): https://github.com/blacksinisterx/hotswap

Load unpacked in Chrome. If it breaks on your chat, probe mode records what failed, with no chat text. Send me that.

Which AI should I check next?
```

---

## Before you post

| Claim in the posts | Where it comes from |
|---|---|
| Works on real ChatGPT and Gemini, signed out | `launch/extension-demo/record-real.mjs`; the video itself; commit "Real-site fixes" |
| The three bugs (ChatGPT markup, whole-page scroll, Gemini textarea) | `extension/src/content/adapters/chatgpt.ts` and `gemini.ts` comments, `capture.ts`; README "Checked on the real sites" |
| Secrets removed first, fails closed | `src/core/redact.ts`; `npm test` (29 tests) |
| Never presses send | no code path clicks a send button; the extension tests count send clicks (14 tests, `npm run test:extension`) |
| No model, no server, no account | no network calls in `extension/src`; only `chrome.storage.local` |
| Claude and the limit banner are unproven | README "Not yet checked on real pages" |

- Post it only after the repo is public, or the Load unpacked line has nowhere to point.
- "Which AI should I check next?" invites replies; answer them with what you actually tested.
