"use strict";
(() => {
  // src/core/hash.ts
  var K = new Uint32Array([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var rotr = (x, n) => x >>> n | x << 32 - n;
  function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const bits = data.length * 8;
    const padded = new Uint8Array(data.length + 9 + 63 >> 6 << 6);
    padded.set(data);
    padded[data.length] = 128;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bits / 4294967296));
    view.setUint32(padded.length - 4, bits >>> 0);
    const h2 = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
    const w = new Uint32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
        w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h2;
      for (let i = 0; i < 64; i += 1) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = e & f ^ ~e & g;
        const t1 = hh + S1 + ch + K[i] + w[i] >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = a & b ^ a & c ^ b & c;
        const t2 = S0 + maj >>> 0;
        hh = g;
        g = f;
        f = e;
        e = d + t1 >>> 0;
        d = c;
        c = b;
        b = a;
        a = t1 + t2 >>> 0;
      }
      h2[0] += a;
      h2[1] += b;
      h2[2] += c;
      h2[3] += d;
      h2[4] += e;
      h2[5] += f;
      h2[6] += g;
      h2[7] += hh;
    }
    return [...h2].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }

  // src/core/redact.ts
  var R = (kind) => `[REDACTED:${kind}]`;
  var RULES = [
    { kind: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
    { kind: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
    { kind: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
    { kind: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/g },
    { kind: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { kind: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { kind: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
    { kind: "stripe-key", pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
    { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
    { kind: "bearer-token", pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}/g, replace: (_m, pre) => `${pre}${R("bearer-token")}` },
    { kind: "url-password", pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)[^/\s@]{3,}(@)/gi, replace: (_m, pre, at) => `${pre}${R("url-password")}${at}` },
    // NAME=value (.env lines, exports, or inline in a sentence) where the NAME says it is a secret.
    // A value that is only a reference (process.env.X, $X, ${X}, <placeholder>, a call) is not a secret and is kept.
    {
      kind: "env-secret",
      pattern: /((?<![A-Za-z0-9_])(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL)[A-Z0-9_]*\s*[=:]\s*)(["']?)(?!process\.|import\.meta|os\.|env\.|getenv|\$|\{|<|\[)[^\s"'#,;)(]{6,}\2/g,
      replace: (_m, pre, q) => `${pre}${q}${R("env-secret")}${q}`
    }
  ];
  function redact(text, rules = RULES, seen) {
    if (typeof text !== "string") throw new TypeError("redact() needs a string");
    const hits = {};
    let out = text;
    for (const rule of rules) {
      out = out.replace(rule.pattern, (...args) => {
        const key = `${rule.kind}|${args[0]}`;
        if (!seen?.has(key)) {
          hits[rule.kind] = (hits[rule.kind] ?? 0) + 1;
          seen?.add(key);
        }
        return rule.replace ? rule.replace(args[0], ...args.slice(1)) : R(rule.kind);
      });
    }
    return { text: out, hits };
  }
  function mergeHits(into, from) {
    for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  }

  // src/core/capsule.ts
  var PRESETS = { minimal: 3, standard: 10, verbose: 20, full: Number.POSITIVE_INFINITY };
  var MESSAGE_CAP = 2e4;
  var VAULT_MAX_BLOCKS = 30;
  var VAULT_MAX_BYTES = 8e4;
  var RedactionFailed = class extends Error {
    constructor(cause) {
      super(`Redaction failed, so nothing was exported (${cause instanceof Error ? cause.message : String(cause)}).`);
      this.name = "RedactionFailed";
    }
  };
  var sha = (s2) => sha256Hex(s2);
  var cap = (s2, n) => s2.length > n ? `${s2.slice(0, n)}\u2026` : s2;
  function codeBlocks(text) {
    const out = [];
    for (const m of text.matchAll(/(^|\n)(`{3,})([\w+#.-]*)[^\n]*\n([\s\S]*?)\n\2(?=\n|$)/g)) out.push({ lang: m[3] || "text", text: m[4] });
    return out;
  }
  function buildCapsule(session, opts = {}) {
    const preset = opts.preset ?? "standard";
    const seen = /* @__PURE__ */ new Set();
    const redactor = opts.redactor ?? ((t) => redact(t, void 0, seen));
    const hits = {};
    const safe = (text) => {
      try {
        const r = redactor(text);
        if (typeof r?.text !== "string") throw new TypeError("the redactor returned no text");
        mergeHits(hits, r.hits ?? {});
        return r.text;
      } catch (e) {
        throw new RedactionFailed(e);
      }
    };
    const msgs = session.messages;
    const users = msgs.filter((m) => m.role === "user");
    const n = PRESETS[preset];
    const tailSrc = Number.isFinite(n) ? msgs.slice(-n) : msgs;
    let cutByCap = 0;
    const tail = tailSrc.map((m) => {
      let text = m.text;
      if (text.length > MESSAGE_CAP) {
        text = `${text.slice(0, MESSAGE_CAP)}
[... cut by Hotswap at ${MESSAGE_CAP} characters ...]`;
        cutByCap += 1;
      }
      return {
        ...m,
        text: safe(text),
        tools: m.tools.map((t) => ({ ...t, summary: safe(t.summary), command: t.command ? safe(t.command) : void 0, result: t.result ? safe(t.result) : void 0 }))
      };
    });
    const found = [];
    for (const m of msgs) if (m.role === "assistant") for (const b of codeBlocks(m.text)) found.push({ ...b, messageId: m.id });
    const latest = /* @__PURE__ */ new Map();
    for (const b of found) latest.set(`${b.lang}|${(b.text.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 80)}`, b);
    let vault = [...latest.values()].map((b) => {
      const text = safe(b.text);
      return { lang: b.lang, text, sha256: sha(text), messageId: b.messageId };
    });
    let bytes = vault.reduce((a, b) => a + b.text.length, 0);
    while (vault.length > VAULT_MAX_BLOCKS || bytes > VAULT_MAX_BYTES) {
      bytes -= vault[0].text.length;
      vault = vault.slice(1);
    }
    const toolEvents = msgs.flatMap((m) => m.tools);
    const written = [];
    for (const t of toolEvents) for (const f of t.written) {
      const i = written.indexOf(f);
      if (i >= 0) written.splice(i, 1);
      written.push(f);
    }
    const rel = (f) => session.cwd && f.replace(/\\/g, "/").toLowerCase().startsWith(`${session.cwd.replace(/\\/g, "/").toLowerCase()}/`) ? f.slice(session.cwd.length + 1) : f;
    const files = written.slice(-40).map((f) => safe(rel(f)));
    const commands = toolEvents.filter((t) => t.command).slice(-8).map((t) => ({ command: safe(t.command), ok: t.ok, result: t.result ? safe(cap(t.result, 160)) : void 0 }));
    const failed = [...toolEvents].reverse().find((t) => t.ok === false);
    const attachments = msgs.reduce((a, m) => a + (m.attachments?.length ?? 0), 0);
    const cutBySource = msgs.filter((m) => m.truncated).length;
    const tier = session.source.tool === "antigravity" || cutBySource > 0 || session.incomplete ? "partial" : preset === "full" && cutByCap === 0 && vault.length === found.length ? "verbatim" : "hybrid";
    const notes = session.notes.map(safe);
    if (vault.length < found.length) notes.push(`${found.length - vault.length} code block(s) are not in the vault: older versions of the same block were replaced by the newest, or the vault size cap was reached.`);
    if (Number.isFinite(n) && msgs.length > n) notes.push(`Only the last ${n} of ${msgs.length} turns are included word for word; the state card covers the rest.`);
    const capsule = {
      schema: 1,
      id: sha(`${session.source.sessionId}|${session.source.endedAt ?? ""}|${preset}`).slice(0, 10),
      createdAt: (opts.now ?? /* @__PURE__ */ new Date()).toISOString(),
      preset,
      source: { ...session.source, title: session.source.title ? safe(session.source.title) : void 0 },
      workspace: { cwd: session.cwd, gitBranch: session.gitBranch },
      goal: safe(cap(users[0]?.text ?? "(no user message found)", 800)),
      latestRequest: safe(cap(users[users.length - 1]?.text ?? "(no user message found)", 1200)),
      openTasks: session.todos.filter((t) => t.status !== "completed").map((t) => ({ ...t, text: safe(t.text) })),
      files,
      commands,
      ...failed ? { lastError: safe(cap(`${failed.summary}${failed.result ? `: ${failed.result}` : ""}`, 300)) } : {},
      tail,
      vault,
      artifacts: session.artifacts.map((a) => ({ ...a, text: safe(a.text) })),
      // a limit from earlier in the session is history; only a notice nothing has followed is a reason to switch
      ...session.limit?.isLatest ? { limit: { ...session.limit, text: safe(session.limit.text) } } : {},
      fidelity: {
        tier,
        messagesRead: msgs.length,
        messagesInTail: tail.length,
        turnsCutByCap: cutByCap,
        turnsCutBySource: cutBySource,
        codeBlocksFound: found.length,
        codeBlocksInVault: vault.length,
        toolEventsRead: toolEvents.length,
        attachmentsNotCarried: attachments,
        redactions: hits,
        notes
      }
    };
    return capsule;
  }

  // src/core/render.ts
  var TOOL_LABEL = { "claude-code": "Claude Code", antigravity: "Antigravity", chatgpt: "ChatGPT", "claude-ai": "Claude", gemini: "Gemini" };
  var MARK = "<!-- hotswap:meta -->";
  var sha2 = (s2) => sha256Hex(s2);
  function fence(text, lang = "") {
    const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
    const f = "`".repeat(longest + 1);
    return `${f}${lang}
${text}
${f}`;
  }
  function balance(text) {
    const n = (text.match(/^\s*`{3,}/gm) ?? []).length;
    return n % 2 === 1 ? `${text}
\`\`\`` : text;
  }
  var quote = (text) => text.split("\n").map((l) => l ? `> ${l}` : ">").join("\n");
  var who = (m) => m.role === "user" ? "User" : "Assistant";
  function renderCapsule(c) {
    const tool = TOOL_LABEL[c.source.tool];
    const L = [];
    L.push("# Hotswap handoff", "");
    L.push(`> You are taking over a task that was in progress in **${tool}**. Read this whole file, then continue from "Latest request" below.`);
    L.push("> Do not start over and do not redo work that is already finished. If anything here looks cut off or unclear, say so first, then carry on.", "");
    L.push("## State", "");
    L.push(`- **Goal (the first request):** ${c.goal.replace(/\n+/g, " ")}`);
    L.push(`- **Latest request:** ${c.latestRequest.replace(/\n+/g, " ")}`);
    if (c.workspace.cwd) L.push(`- **Working folder:** \`${c.workspace.cwd}\`${c.workspace.gitBranch ? `, git branch \`${c.workspace.gitBranch}\`` : ""}`);
    if (c.source.title) L.push(`- **Session:** ${c.source.title}`);
    if (c.limit) L.push(`- **Why the switch:** ${tool} reported a usage limit${c.limit.resets ? `; it resets at ${c.limit.resets}` : ""}.`);
    L.push("");
    if (c.openTasks.length) {
      L.push("### Open tasks", "");
      for (const t of c.openTasks) L.push(`- [${t.status === "in_progress" ? "/" : " "}] ${t.text}`);
      L.push("");
    }
    if (c.files.length) {
      L.push("### Files changed (most recent last)", "");
      for (const f2 of c.files) L.push(`- \`${f2}\``);
      L.push("");
    }
    if (c.commands.length) {
      L.push("### Last commands", "");
      for (const r of c.commands) L.push(`- \`${r.command.replace(/`/g, "'")}\`${r.ok === false ? " (failed)" : r.ok ? " (ok)" : ""}${r.result ? `: ${r.result.replace(/\s+/g, " ")}` : ""}`);
      L.push("");
    }
    if (c.lastError) L.push("### Last error", "", c.lastError, "");
    L.push(`## Recent conversation (last ${c.tail.length} turn${c.tail.length === 1 ? "" : "s"}, word for word; each turn is quoted with "> ")`, "");
    for (const m of c.tail) {
      L.push(`### ${who(m)}${m.ts ? ` \xB7 ${m.ts}` : ""}${m.truncated ? " \xB7 (cut short by the source tool)" : ""}`, "");
      L.push(m.text ? quote(balance(m.text)) : "_(no text; tools only)_", "");
      if (m.tools.length) L.push(`_Tools used: ${m.tools.map((t) => t.summary + (t.ok === false ? " (failed)" : "")).join("; ")}_`, "");
      if (m.attachments?.length) L.push(`_Attached and not carried: ${m.attachments.join(", ")}_`, "");
    }
    if (c.vault.length) {
      L.push(`## Code from the conversation (${c.vault.length} block${c.vault.length === 1 ? "" : "s"}, exact)`, "");
      c.vault.forEach((b, i) => {
        L.push(`### ${i + 1}. ${b.lang} \xB7 from \`${b.messageId}\` \xB7 sha256 \`${b.sha256.slice(0, 12)}\``, "", fence(b.text, b.lang), "");
      });
    }
    for (const a of c.artifacts) {
      L.push(`## ${tool}'s own note: ${a.name}${a.truncated ? " (cut)" : ""}`, "", a.text.trim(), "");
    }
    const f = c.fidelity;
    L.push("## Fidelity report", "");
    L.push(`- **Tier:** ${f.tier} (${f.tier === "verbatim" ? "every turn and code block word for word" : f.tier === "hybrid" ? "state card, recent turns and code exact; older turns summarised by the state card only" : "the source tool keeps only part of the conversation"})`);
    L.push(`- Turns read: ${f.messagesRead}; included word for word: ${f.messagesInTail}`);
    L.push(`- Code blocks found: ${f.codeBlocksFound}; in the vault: ${f.codeBlocksInVault}`);
    L.push(`- Tool actions read: ${f.toolEventsRead}; turns cut by Hotswap: ${f.turnsCutByCap}; turns cut by the source tool: ${f.turnsCutBySource}`);
    if (f.attachmentsNotCarried) L.push(`- Attachments not carried: ${f.attachmentsNotCarried}`);
    const red = Object.entries(f.redactions);
    L.push(`- Secrets removed: ${red.length ? red.map(([k, v]) => `${v} ${k}`).join(", ") : "none found"}`);
    for (const n of f.notes) L.push(`- Note: ${n}`);
    L.push("");
    const body = `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}

`;
    const meta = {
      hotswap: 1,
      id: c.id,
      createdAt: c.createdAt,
      preset: c.preset,
      tier: f.tier,
      source: { tool: c.source.tool, sessionId: c.source.sessionId, endedAt: c.source.endedAt },
      counts: { turns: f.messagesRead, tail: f.messagesInTail, codeBlocks: f.codeBlocksInVault },
      bodySha256: sha2(`${body}${MARK}
`)
    };
    return `${body}${MARK}
\`\`\`json hotswap-capsule
${JSON.stringify(meta, null, 2)}
\`\`\`
`;
  }

  // extension/src/shared/storage.ts
  var DEFAULTS = { preset: "standard", probe: false, limitHints: true };
  var MAX_CAPSULES = 12;
  var MAX_PROBE = 200;
  async function getSettings() {
    const r = await chrome.storage.local.get("settings");
    return { ...DEFAULTS, ...r.settings };
  }
  async function listCapsules() {
    const r = await chrome.storage.local.get("capsules");
    return r.capsules ?? [];
  }
  async function saveCapsule(c) {
    const all = (await listCapsules()).filter((x) => x.id !== c.id);
    await chrome.storage.local.set({ capsules: [c, ...all].slice(0, MAX_CAPSULES) });
  }
  async function deleteCapsule(id) {
    await chrome.storage.local.set({ capsules: (await listCapsules()).filter((x) => x.id !== id) });
  }
  var latestCapsule = async () => (await listCapsules())[0];
  async function probeLog(entry) {
    const r = await chrome.storage.local.get("probe");
    const list = (r.probe ?? []).concat({ t: (/* @__PURE__ */ new Date()).toISOString(), ...entry }).slice(-MAX_PROBE);
    await chrome.storage.local.set({ probe: list });
  }
  async function getProbe() {
    const r = await chrome.storage.local.get("probe");
    return r.probe ?? [];
  }

  // extension/src/content/domText.ts
  var BLOCK = /* @__PURE__ */ new Set(["P", "DIV", "SECTION", "ARTICLE", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TABLE", "TR", "PRE", "FIGURE", "HR"]);
  var SKIP_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "BUTTON", "SVG", "NOSCRIPT", "TEMPLATE", "INPUT", "TEXTAREA", "SELECT"]);
  function languageOf(pre) {
    const code = pre.querySelector("code");
    const cls = `${code?.className ?? ""} ${pre.className ?? ""}`;
    const m = /(?:language|lang)-([\w+#.-]+)/i.exec(cls);
    if (m) return m[1].toLowerCase();
    const data = pre.closest("[data-language]")?.getAttribute("data-language") ?? code?.getAttribute("data-language");
    if (data) return data.toLowerCase();
    const prev = pre.previousElementSibling ?? pre.parentElement?.previousElementSibling;
    const label = (prev?.querySelector("span")?.textContent ?? prev?.textContent ?? "").trim();
    return /^[A-Za-z][\w+#.-]{0,14}$/.test(label) ? label.toLowerCase() : "";
  }
  function fence2(code, lang) {
    const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
    const f = "`".repeat(longest + 1);
    return `

${f}${lang}
${code.replace(/\n+$/, "")}
${f}

`;
  }
  function elementToText(root, opts = {}) {
    const out = [];
    const walk = (node, listDepth, ordinal) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? "").replace(/\s+/g, " ");
        if (t) out.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.hasAttribute("data-find-omitted") || el.getAttribute("aria-hidden") === "true" || el.classList.contains("sr-only") || el.classList.contains("cdk-visually-hidden") || opts.skip?.(el)) return;
      const tag = el.tagName.toUpperCase();
      if (tag === "BR") {
        out.push("\n");
        return;
      }
      if (tag === "PRE") {
        out.push(fence2(el.textContent ?? "", languageOf(el)));
        return;
      }
      if (tag === "CODE") {
        const t = el.textContent ?? "";
        out.push(t.includes("\n") ? fence2(t, languageOf(el)) : `\`${t}\``);
        return;
      }
      if (tag === "IMG") {
        const alt = el.getAttribute("alt");
        if (alt) out.push(`[image: ${alt}]`);
        return;
      }
      if (tag === "HR") {
        out.push("\n\n---\n\n");
        return;
      }
      if (/^H[1-6]$/.test(tag)) {
        out.push(`

${"#".repeat(Number(tag[1]))} `);
        el.childNodes.forEach((c) => walk(c, listDepth, null));
        out.push("\n\n");
        return;
      }
      if (tag === "UL" || tag === "OL") {
        out.push("\n");
        const ord = tag === "OL" ? { n: 0 } : null;
        el.childNodes.forEach((c) => walk(c, listDepth + 1, ord));
        out.push("\n");
        return;
      }
      if (tag === "LI") {
        if (ordinal) ordinal.n += 1;
        out.push(`
${"  ".repeat(Math.max(0, listDepth - 1))}${ordinal ? `${ordinal.n}. ` : "- "}`);
        el.childNodes.forEach((c) => walk(c, listDepth, null));
        return;
      }
      if (tag === "TR") {
        const cells = [...el.children].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
        out.push(`
| ${cells.join(" | ")} |`);
        return;
      }
      if (tag === "TABLE") {
        out.push("\n");
        el.childNodes.forEach((c) => walk(c, listDepth, null));
        out.push("\n");
        return;
      }
      if (tag === "BLOCKQUOTE") {
        const inner = elementToText(el, opts).split("\n").map((l) => `> ${l}`.trimEnd()).join("\n");
        out.push(`

${inner}

`);
        return;
      }
      const block = BLOCK.has(tag);
      if (block) out.push("\n\n");
      el.childNodes.forEach((c) => walk(c, listDepth, null));
      if (block) out.push("\n\n");
    };
    root.childNodes.forEach((c) => walk(c, 0, null));
    return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  }

  // extension/src/content/adapters/chatgpt.ts
  var USER = '[data-chatgpt-search-unit-key$=":user"], [data-message-author-role="user"]';
  var ASSISTANT = '[data-chatgpt-search-unit-key$=":assistant"], [data-message-author-role="assistant"]';
  var SCROLLER = '[data-app-action-timeline-scroll], .thread-scroll-container, main [class*="overflow-y-auto"]';
  var COMPOSER = '#prompt-textarea, [data-testid="prompt-textarea"], div[contenteditable="true"][role="textbox"], form textarea';
  var idOf = (el, i) => {
    const unit = el.getAttribute("data-chatgpt-search-unit-key");
    const ids = el.getAttribute("data-chatgpt-search-message-ids")?.split(/\s+/)[0] ?? el.getAttribute("data-message-id");
    return unit ?? ids ?? `idx-${i}`;
  };
  var chatgpt = {
    id: "chatgpt",
    name: "ChatGPT",
    tool: "chatgpt",
    hosts: ["chatgpt.com", "chat.openai.com"],
    scroller: (doc) => doc.querySelector(SCROLLER),
    messages(doc) {
      const out = [];
      doc.querySelectorAll(`${USER}, ${ASSISTANT}`).forEach((el, i) => {
        const role = el.matches(USER) ? "user" : "assistant";
        const body = role === "user" ? el.querySelector(".whitespace-pre-wrap") ?? el : el.querySelector("[data-markdown-text-style], .markdown") ?? el;
        const text = elementToText(body, { skip: (e) => e.tagName === "H4" || e.tagName === "H5" || e.tagName === "H6" ? e.classList.contains("sr-only") : false });
        const attachments = [...el.querySelectorAll('[data-testid="library-file-icon"]')].map((f) => (f.closest('[class*="file"]')?.textContent ?? "file").trim().slice(0, 80));
        if (text || attachments.length) out.push({ key: idOf(el, i), role, text, attachments });
      });
      return out;
    },
    composer: (doc) => doc.querySelector(COMPOSER),
    title: (doc) => doc.title?.replace(/\s*[|\-–]\s*ChatGPT\s*$/i, "").trim() || void 0,
    streaming: (doc) => !!doc.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]'),
    selectorHealth: (doc) => ({
      userMessages: doc.querySelectorAll(USER).length,
      assistantMessages: doc.querySelectorAll(ASSISTANT).length,
      scroller: !!doc.querySelector(SCROLLER),
      composer: !!doc.querySelector(COMPOSER)
    })
  };

  // extension/src/content/adapters/claude.ts
  var USER2 = '[data-testid="user-message"]';
  var ASSISTANT2 = '[data-testid="assistant-message"], .font-claude-response:not(.font-claude-response-body)';
  var SCROLLER2 = '[data-autoscroll-container], [class*="flex-1"][class*="overflow-y-auto"], [data-scroll-container]';
  var COMPOSER2 = 'div[contenteditable="true"].ProseMirror, [data-testid="chat-input"], div[contenteditable="true"][role="textbox"]';
  var skipReply = (e) => e.matches('[data-testid="message-actions"], [role="toolbar"], time');
  var claude = {
    id: "claude",
    name: "Claude",
    tool: "claude-ai",
    hosts: ["claude.ai"],
    scroller: (doc) => doc.querySelector(SCROLLER2),
    messages(doc) {
      const out = [];
      doc.querySelectorAll(`${USER2}, ${ASSISTANT2}`).forEach((el, i) => {
        const user = el.matches(USER2);
        const row = el.closest("[data-turn-key]");
        const key = `${row?.getAttribute("data-turn-key") ?? `idx-${i}`}:${user ? "user" : "assistant"}`;
        const body = user ? el : el.querySelector("[data-transcript-engine-root]") ?? el;
        const text = elementToText(body, { skip: skipReply });
        const attachments = user ? [...el.closest("[data-turn-key]")?.querySelectorAll('[data-testid="file-thumbnail"] img') ?? []].map((img) => img.getAttribute("alt") ?? "upload") : [];
        if (text || attachments.length) out.push({ key, role: user ? "user" : "assistant", text, attachments });
      });
      return out;
    },
    composer: (doc) => doc.querySelector(COMPOSER2),
    title: (doc) => doc.title?.replace(/\s*[|\-–]\s*Claude\s*$/i, "").trim() || void 0,
    streaming: (doc) => !!doc.querySelector('[data-is-streaming="true"], button[aria-label^="Stop"]'),
    selectorHealth: (doc) => ({
      userMessages: doc.querySelectorAll(USER2).length,
      assistantMessages: doc.querySelectorAll(ASSISTANT2).length,
      scroller: !!doc.querySelector(SCROLLER2),
      composer: !!doc.querySelector(COMPOSER2)
    })
  };

  // extension/src/content/adapters/gemini.ts
  var SCROLLER3 = "#chat-history, .chat-history-scroll-container, [data-scroll-container]";
  var COMPOSER3 = 'rich-textarea .ql-editor[contenteditable="true"], div.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"], textarea[placeholder*="Ask Gemini" i], textarea.gds-body-l';
  var gemini = {
    id: "gemini",
    name: "Gemini",
    tool: "gemini",
    hosts: ["gemini.google.com"],
    scroller: (doc) => doc.querySelector(SCROLLER3),
    messages(doc) {
      const out = [];
      doc.querySelectorAll("#chat-history .conversation-container, .conversation-container").forEach((c, i) => {
        const base = c.id || `c${i}`;
        const q = c.querySelector("user-query");
        if (q) {
          const lines = [...q.querySelectorAll(".query-text-line")].map((l) => (l.textContent ?? "").trim());
          const text = lines.length ? lines.join("\n") : elementToText(q.querySelector(".query-text") ?? q);
          const attachments = [...q.querySelectorAll('.file-preview-container img, [data-test-id*="file"] img')].map((im) => im.getAttribute("alt") ?? "upload");
          if (text || attachments.length) out.push({ key: `${base}:user`, role: "user", text, attachments });
        }
        const m = c.querySelector("model-response");
        if (m) {
          const body = m.querySelector("message-content .markdown, .model-response-text .markdown, message-content") ?? m;
          const text = elementToText(body, { skip: (e) => e.tagName === "MODEL-THOUGHTS" || e.matches('.code-block-decoration, .buttons, [role="toolbar"]') });
          if (text) out.push({ key: `${base}:assistant`, role: "assistant", text, attachments: [] });
        }
      });
      return out;
    },
    composer: (doc) => doc.querySelector(COMPOSER3),
    title: (doc) => doc.title?.replace(/\s*[|\-–]\s*(Google )?Gemini\s*$/i, "").trim() || void 0,
    streaming: (doc) => !!doc.querySelector('button[aria-label*="Stop"], .send-button.stop'),
    selectorHealth: (doc) => ({
      userMessages: doc.querySelectorAll("user-query").length,
      assistantMessages: doc.querySelectorAll("model-response").length,
      scroller: !!doc.querySelector(SCROLLER3),
      composer: !!doc.querySelector(COMPOSER3)
    })
  };

  // extension/src/content/adapters/index.ts
  var ADAPTERS = [chatgpt, claude, gemini];
  function pickAdapter(loc, doc, allowMeta = false) {
    const byHost = ADAPTERS.find((a) => a.hosts.some((h2) => loc.hostname === h2 || loc.hostname.endsWith(`.${h2}`)));
    if (byHost) return byHost;
    if (!allowMeta) return void 0;
    const id = doc.querySelector('meta[name="hotswap-site"]')?.getAttribute("content");
    return ADAPTERS.find((a) => a.id === id);
  }

  // extension/src/content/capture.ts
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function captureMessages(adapter2, doc, opts = {}) {
    const maxSteps = opts.maxSteps ?? 80;
    const wait = opts.waitMs ?? 400;
    const cache = /* @__PURE__ */ new Map();
    const collect = (order2) => {
      let fresh = 0;
      for (const m of adapter2.messages(doc)) {
        const known = cache.get(m.key);
        if (!known) fresh += 1;
        if (!known || m.text.length >= known.text.length) cache.set(m.key, m);
        if (order2 && !order2.includes(m.key)) order2.push(m.key);
      }
      return fresh;
    };
    const scroller = adapter2.scroller(doc);
    const flags = { reachedTop: "unknown", reachedBottom: "unknown", steps: 0, stoppedBecause: "the page was read as it was", streaming: adapter2.streaming(doc) };
    collect();
    if (!scroller) {
      return { messages: [...cache.values()], flags };
    }
    const startTop = scroller.scrollTop;
    let stable = 0;
    let lastHeight = scroller.scrollHeight;
    while (flags.steps < maxSteps && stable < 2) {
      opts.onProgress?.(`Loading the start of the conversation (${cache.size} messages so far)`);
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll"));
      await sleep(wait);
      flags.steps += 1;
      const fresh = collect();
      const grew = scroller.scrollHeight !== lastHeight;
      lastHeight = scroller.scrollHeight;
      stable = fresh === 0 && !grew && scroller.scrollTop <= 1 ? stable + 1 : 0;
    }
    flags.reachedTop = stable >= 2;
    if (!flags.reachedTop) flags.stoppedBecause = `stopped after ${flags.steps} steps before the start of the conversation was clearly reached`;
    const order = [];
    collect(order);
    const step = Math.max(80, Math.floor(scroller.clientHeight * 0.8));
    let guard = 0;
    while (guard < 400) {
      guard += 1;
      const before = scroller.scrollTop;
      if (before + scroller.clientHeight >= scroller.scrollHeight - 2) break;
      scroller.scrollTop = before + step;
      scroller.dispatchEvent(new Event("scroll"));
      await sleep(Math.max(40, Math.floor(wait / 3)));
      collect(order);
      if (scroller.scrollTop === before) break;
    }
    flags.reachedBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    if (flags.reachedTop === true && flags.reachedBottom === true) flags.stoppedBecause = "read from the start of the conversation to the latest message";
    scroller.scrollTop = startTop;
    const messages = order.map((k) => cache.get(k)).concat([...cache.entries()].filter(([k]) => !order.includes(k)).map(([, v]) => v));
    return { messages, flags };
  }
  function toSession(adapter2, doc, loc, raw, flags, now = /* @__PURE__ */ new Date()) {
    const notes = [`Captured from the open ${adapter2.name} page by scrolling it; ${flags.stoppedBecause}.`];
    if (flags.streaming) notes.push("The AI was still writing a reply when this was captured; the last reply may be unfinished.");
    const attachments = raw.reduce((n, m) => n + m.attachments.length, 0);
    if (attachments) notes.push(`${attachments} upload(s) are listed by name only; their contents cannot travel in a text capsule.`);
    const messages = raw.map((m, i) => ({ id: m.key || `m${i}`, role: m.role, text: m.text, tools: [], ...m.attachments.length ? { attachments: m.attachments } : {} }));
    return {
      source: { tool: adapter2.tool, sessionId: loc.pathname.split("/").filter(Boolean).pop() ?? "page", title: adapter2.title(doc), path: `${loc.origin}${loc.pathname}`, endedAt: now.toISOString() },
      messages,
      todos: [],
      artifacts: [],
      notes,
      incomplete: flags.reachedTop !== true
    };
  }

  // extension/src/content/inject.ts
  var norm = (s2) => s2.replace(/\s+/g, " ").trim();
  var probeOf = (text) => norm(text).slice(0, 40);
  var valueOf = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.innerText || el.textContent || "";
  var has = (el, text) => norm(valueOf(el)).includes(probeOf(text));
  var tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  function placeCursorAtEnd(el) {
    const sel = el.ownerDocument.defaultView?.getSelection();
    if (!sel) return;
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  async function insertText(el, text) {
    const tried = [];
    const doc = el.ownerDocument;
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      tried.push("native-value-setter");
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      const next = el.value ? `${el.value}

${text}` : text;
      if (setter) setter.call(el, next);
      else el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      return { ok: has(el, text), technique: "native-value-setter", verified: has(el, text), tried };
    }
    const draft = norm(valueOf(el)) ? "\n\n" : "";
    const payload = `${draft}${text}`;
    tried.push("execCommand-insertText");
    placeCursorAtEnd(el);
    try {
      doc.execCommand("insertText", false, payload);
    } catch {
    }
    await tick();
    if (has(el, text)) return { ok: true, technique: "execCommand-insertText", verified: true, tried };
    tried.push("paste-event");
    el.focus();
    placeCursorAtEnd(el);
    const dt = new DataTransfer();
    dt.setData("text/plain", payload);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await tick(120);
    if (has(el, text)) return { ok: true, technique: "paste-event", verified: true, tried };
    tried.push("beforeinput-insertFromPaste");
    el.focus();
    placeCursorAtEnd(el);
    el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", data: payload, dataTransfer: dt, bubbles: true, cancelable: true }));
    await tick(120);
    if (has(el, text)) return { ok: true, technique: "beforeinput-insertFromPaste", verified: true, tried };
    tried.push("clipboard-then-paste-command");
    try {
      await navigator.clipboard.writeText(payload);
      el.focus();
      placeCursorAtEnd(el);
      doc.execCommand("paste");
      await tick(150);
      if (has(el, text)) return { ok: true, technique: "clipboard-then-paste-command", verified: true, tried };
    } catch {
    }
    return { ok: false, technique: "none", verified: false, tried };
  }
  async function attachFile(el, name, text) {
    const file = new File([text], name, { type: "text/markdown" });
    const dt = new DataTransfer();
    dt.items.add(file);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    await tick(250);
    return { attempted: true };
  }

  // extension/src/content/limit.ts
  var LIMIT_RULES = [
    /\b(you['’]ve|you have)\s+(hit|reached|used)\s+(your|the|all)\b[^.\n]{0,60}\blimit\b/i,
    /\b(usage|message|messages|rate|daily|session|plan|prompt)\s+limit\b[^.\n]{0,40}\b(reached|hit|exceeded|met)\b/i,
    /\b(reached|hit|exceeded)\b[^.\n]{0,30}\b(usage|message|messages|rate|daily|session|plan)\s+limit\b/i,
    /\blimit\b[^.\n]{0,40}\bresets?\b/i,
    /\byou['’]re out of\b[^.\n]{0,30}\b(messages|prompts|requests)\b/i,
    /\btoo many requests\b/i
  ];
  var looksLikeLimit = (text) => text.length > 8 && text.length <= 500 && LIMIT_RULES.some((r) => r.test(text));
  var CHAT_CONTENT = '[data-testid="user-message"], [data-testid="assistant-message"], user-query, model-response, [data-chatgpt-search-unit-key], [data-message-author-role], [data-markdown-text-style], .markdown, pre, code, textarea, [contenteditable="true"]';
  function watchLimits(doc, onHit) {
    const seen = /* @__PURE__ */ new Set();
    const check = (el) => {
      if (el.closest(CHAT_CONTENT) || el.closest("hotswap-root")) return;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!looksLikeLimit(text) || seen.has(text)) return;
      seen.add(text);
      onHit(text);
    };
    const scan = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      check(el);
      el.querySelectorAll('[role="alert"], [role="status"], [role="dialog"], [aria-live], [class*="toast" i], [class*="banner" i], [class*="alert" i]').forEach(check);
    };
    const obs = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(scan);
    });
    obs.observe(doc.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }

  // extension/src/content/ui.ts
  var CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-rounded, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif; }

/* ---- the mascot button ---- */
.chip { position: fixed; right: 14px; bottom: 10px; z-index: 2147483647; width: 66px; height: 92px; padding: 0; border: none; background: none; cursor: pointer; perspective: 260px; -webkit-tap-highlight-color: transparent; }
.chip:focus-visible { outline: 2px solid #ffd23f; outline-offset: 2px; border-radius: 18px; }
.chip:hover:not(:disabled), .chip:active:not(:disabled) { background: none; border-color: transparent; transform: none; }
.mascot { width: 66px; height: 92px; display: block; overflow: visible; filter: drop-shadow(0 6px 10px rgba(0,0,0,.28)); }
.mascot * { transform-box: fill-box; }
.shadow { fill: rgba(0,0,0,.28); transform-origin: center; }
.bob { transform-origin: 50% 100%; }
.eye-happy, .mouth-open, .mouth-wavy, .spark, .sweat { display: none; }
.eye { fill: #1b1722; } .eye-shine { fill: #fff; }
.eye-happy, .mouth { fill: none; stroke: #1b1722; stroke-width: 2.4; stroke-linecap: round; }
.mouth-open { fill: #1b1722; stroke: none; }
.cheek { fill: #ff8fa3; opacity: .65; }
.outline { fill: none; stroke: #1b1722; stroke-width: 2.4; stroke-linejoin: round; }
.top { fill: #ff8a3d; } .bottom { fill: #fff1de; } .seam { stroke: #1b1722; stroke-width: 1.6; opacity: .22; }
.shine { fill: #fff; opacity: .55; }
.limb { fill: #fff1de; stroke: #1b1722; stroke-width: 2.2; }
.foot { fill: #ff8a3d; stroke: #1b1722; stroke-width: 2.2; }
.flame-wrap { transform-origin: 50% 100%; transition: transform .3s cubic-bezier(.2,1.4,.4,1); }
.flame { transform-origin: 50% 100%; }
.f1 { fill: #ff4d1f; stroke: #1b1722; stroke-width: 1.8; stroke-linejoin: round; } .f2 { fill: #ff9d1f; } .f3 { fill: #ffe45c; } .f0 { fill: #ff7a1f; }
.chip[data-mood="alert"] .flame-wrap { transform: scale(1.3); }
.chip[data-mood="busy"] .flame-wrap { transform: scale(1.12) skewX(-8deg); }
.spark { fill: #ffd23f; } .sweat { fill: #7dd3fc; stroke: #1b1722; stroke-width: 1.4; }

.chip[data-mood="happy"] .eye-open, .chip[data-mood="happy"] .mouth-smile { display: none; }
.chip[data-mood="happy"] .eye-happy, .chip[data-mood="happy"] .mouth-open, .chip[data-mood="happy"] .spark { display: inline; }
.chip[data-mood="alert"] .mouth-smile, .chip[data-mood="oops"] .mouth-smile { display: none; }
.chip[data-mood="alert"] .mouth-wavy, .chip[data-mood="oops"] .mouth-wavy { display: inline; }
.chip[data-mood="alert"] .sweat { display: inline; }
.chip[data-mood="busy"] .eye-open { transform: translateX(1.5px); }

.bubble { position: absolute; right: 56px; bottom: 74px; white-space: nowrap; background: #fff; color: #1b1722; font: 800 12px ui-rounded, system-ui, sans-serif; padding: 6px 11px; border-radius: 12px 12px 4px 12px; box-shadow: 0 6px 18px rgba(0,0,0,.3); opacity: 0; transform: translateY(6px) scale(.9); transform-origin: bottom right; pointer-events: none; transition: opacity .2s, transform .25s cubic-bezier(.2,1.4,.4,1); }
.chip[data-mood="alert"] .bubble, .chip:hover .bubble { opacity: 1; transform: none; }
.chip[data-mood="busy"] .bubble { opacity: 0; }

@media (prefers-reduced-motion: no-preference) {
  .chip { animation: drop .7s cubic-bezier(.3,1.5,.5,1) both; }
  .bob { animation: float 3.2s ease-in-out infinite; }
  .shadow { animation: shade 3.2s ease-in-out infinite; }
  .f1 { animation: flick .7s ease-in-out infinite; }
  .f2 { animation: flick .5s ease-in-out infinite reverse; }
  .f3 { animation: flick .36s ease-in-out infinite; }
  .f0 { animation: flick .6s ease-in-out infinite .15s; }
  .chip[data-mood="alert"] .flame { animation-duration: .25s; }
  .eyes { animation: blink 5.5s infinite; transform-origin: 50% 50%; }
  .chip:hover .bob { animation: wiggle .55s ease-in-out infinite; }
  .chip:hover .arm-r { animation: wave .45s ease-in-out infinite; transform-origin: 20% 80%; }
  .chip:active .bob { animation: none; transform: scale(1.12, .88); }
  .chip[data-mood="busy"] .mascot { animation: flip 1.1s cubic-bezier(.5,0,.5,1) infinite; }
  .chip[data-mood="busy"] .bob { animation: none; }
  .chip[data-mood="happy"] .bob { animation: hop .62s ease-out 3; }
  .chip[data-mood="happy"] .spark { animation: twinkle .8s ease-in-out infinite; transform-origin: center; }
  .chip[data-mood="happy"] .spark:nth-of-type(2) { animation-delay: .25s; }
  .chip[data-mood="happy"] .spark:nth-of-type(3) { animation-delay: .5s; }
  .chip[data-mood="alert"] .bob { animation: shake .5s ease-in-out infinite; }
  .chip[data-mood="alert"] .sweat { animation: drip 1.1s ease-in infinite; }
  .chip[data-mood="oops"] .bob { animation: oops .6s ease-in-out 2; }
  .panel.open { animation: panelIn .32s cubic-bezier(.2,1.25,.4,1); }
  .toast { animation: toastIn .3s cubic-bezier(.2,1.3,.4,1); }
  .bar i { animation: slide 1.1s ease-in-out infinite; }
  .drag .pillicon { animation: float 2.4s ease-in-out infinite; }
  button { transition: transform .12s, background .15s, box-shadow .15s; }
  button:hover:not(:disabled) { transform: translateY(-1px); }
  button:active:not(:disabled) { transform: scale(.96); }
  @keyframes flick { 0%, 100% { transform: scale(1, 1) skewX(0); } 25% { transform: scale(.93, 1.12) skewX(-5deg); } 50% { transform: scale(1.06, .94) skewX(4deg); } 75% { transform: scale(.96, 1.08) skewX(-2deg); } }
  @keyframes drop { from { transform: translateY(-140px) scale(.8); opacity: 0; } 60% { opacity: 1; } }
  @keyframes float { 50% { transform: translateY(-4px); } }
  @keyframes shade { 50% { transform: scale(.82); opacity: .7; } }
  @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.08); } }
  @keyframes wiggle { 25% { transform: rotate(-7deg) translateY(-2px); } 75% { transform: rotate(7deg) translateY(-2px); } }
  @keyframes wave { 50% { transform: rotate(-35deg); } }
  @keyframes flip { to { transform: rotateY(360deg); } }
  @keyframes hop { 0% { transform: scale(1.1, .88); } 35% { transform: translateY(-18px) scale(.94, 1.08); } 65% { transform: translateY(0) scale(1.1, .88); } 100% { transform: none; } }
  @keyframes twinkle { 0%, 100% { transform: scale(.2) rotate(0); opacity: 0; } 50% { transform: scale(1.1) rotate(45deg); opacity: 1; } }
  @keyframes shake { 20% { transform: rotate(-6deg); } 40% { transform: rotate(6deg); } 60% { transform: rotate(-4deg); } 80% { transform: rotate(4deg); } }
  @keyframes drip { 0% { transform: translateY(-3px) scale(.6); opacity: 0; } 40% { opacity: 1; } 100% { transform: translateY(8px) scale(1); opacity: 0; } }
  @keyframes oops { 25% { transform: rotate(-9deg) translateY(2px); } 75% { transform: rotate(9deg) translateY(2px); } }
  @keyframes panelIn { from { opacity: 0; transform: translateY(14px) scale(.92); } }
  @keyframes toastIn { from { opacity: 0; transform: translateY(14px) scale(.9); } }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
}

/* ---- the panel ---- */
.panel { position: fixed; right: 16px; bottom: 110px; z-index: 2147483647; width: 392px; max-height: calc(100vh - 134px); overflow: auto; color: #ece9f6; border: 1px solid #38334a; border-radius: 20px; background: radial-gradient(120% 80% at 100% 0%, #2a1f35 0%, #17141f 55%); box-shadow: 0 18px 60px rgba(8,4,20,.65), inset 0 1px 0 rgba(255,255,255,.06); padding: 14px 16px 12px; font-size: 13px; line-height: 1.45; display: none; transform-origin: bottom right; scrollbar-width: thin; scrollbar-color: #3a3550 transparent; }
.panel.open { display: block; }
h2 { margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.brand { display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
.brand .mascot { width: 36px; height: 50px; filter: none; }
.brand .mascot .bob, .brand .mascot .shadow { animation: none; }
.site { font-size: 11px; font-weight: 700; color: #ffb77f; background: rgba(255,138,61,.13); border: 1px solid rgba(255,138,61,.3); border-radius: 999px; padding: 2px 9px; }
h3 { margin: 16px 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .09em; color: #c9bfe6; display: flex; align-items: center; gap: 8px; }
h3 b { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #ffb06a, #ff6b3d); color: #1b1722; font-size: 11px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
button, select { font: 700 12px ui-rounded, system-ui, sans-serif; border-radius: 11px; border: 1px solid #423c58; background: #221e30; color: #ece9f6; padding: 8px 12px; cursor: pointer; }
button:hover:not(:disabled) { background: #2d2840; border-color: #5a5278; }
button.primary { background: linear-gradient(135deg, #ffa05a, #ff6b3d); color: #1b1722; border-color: transparent; box-shadow: 0 4px 14px rgba(255,107,61,.35); }
button.primary:hover:not(:disabled) { background: linear-gradient(135deg, #ffb070, #ff7a50); box-shadow: 0 6px 18px rgba(255,107,61,.5); }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, select:focus-visible { outline: 2px solid #ffd23f; outline-offset: 1px; }
.x { background: rgba(255,255,255,.06); border: none; color: #b8b0d0; font-size: 18px; line-height: 1; width: 28px; height: 28px; padding: 0; border-radius: 50%; }
.status { color: #c4bcdc; margin: 8px 0 0; min-height: 18px; }
.bar { height: 5px; border-radius: 99px; background: #2a2540; overflow: hidden; margin-top: 8px; }
.bar i { display: block; width: 38%; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #ff8a3d, #ffd23f); }
.card { background: rgba(255,255,255,.04); border: 1px solid #38334a; border-radius: 14px; padding: 11px 13px; margin-top: 12px; }
.card ul { margin: 6px 0 0; padding-left: 18px; color: #d8d2ec; }
.card li { margin: 2px 0; }
.tier { display: inline-block; border-radius: 999px; padding: 1px 10px; font-size: 11px; font-weight: 800; background: #1f4a36; color: #7cf0b0; }
.tier.partial { background: #4d3b12; color: #ffd36b; }
.note { color: #b3abcc; font-size: 12px; margin-top: 6px; }
.pillicon { display: inline-block; flex: none; width: 12px; height: 20px; border-radius: 7px; border: 2px solid #1b1722; background: linear-gradient(#ff8a3d 50%, #fff1de 50%); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
.drag { margin-top: 12px; padding: 11px 12px; border: 2px dashed #ff8a3d; border-radius: 14px; color: #ffc698; cursor: grab; text-align: center; user-select: none; display: flex; justify-content: center; align-items: center; gap: 10px; font-weight: 700; background: rgba(255,138,61,.06); }
.drag:hover { background: rgba(255,138,61,.14); }
.drag:active { cursor: grabbing; }
textarea { width: 100%; height: 120px; margin-top: 10px; background: #0f0d15; color: #cfc9e4; border: 1px solid #38334a; border-radius: 12px; font: 11px ui-monospace, Consolas, monospace; padding: 9px; resize: vertical; }
.saved { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 10px; margin-top: 6px; background: rgba(255,255,255,.035); border: 1px solid #2f2a40; border-radius: 12px; }
.saved .title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; }
.saved .title > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.saved .row { flex-wrap: nowrap; flex-shrink: 0; gap: 5px; }
.saved button { padding: 5px 9px; }
.saved small { color: #9b93b6; }
.foot { margin-top: 14px; color: #9b93b6; font-size: 11px; }
.link { background: none; border: none; color: #b8b0d0; text-decoration: underline; padding: 0; font-weight: 600; }
.link:hover:not(:disabled) { background: none; }
.toast { position: fixed; right: 16px; bottom: 110px; z-index: 2147483647; max-width: 360px; background: #1c1827; color: #ece9f6; border: 1px solid #ff8a3d; border-radius: 16px; padding: 12px 15px; font-size: 13px; box-shadow: 0 12px 36px rgba(8,4,20,.6); }
.toast .row { margin-top: 9px; }
.toast.error { border-color: #ff6b81; }
`;
  var NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    el.append(...kids);
    return el;
  }
  function mascot() {
    const star = "M0 -5 Q0 0 5 0 Q0 0 0 5 Q0 0 -5 0 Q0 0 0 -5Z";
    const sparks = [[7, 14], [58, 22], [56, 56]].map(([x, y]) => s("path", { class: "spark", d: star, transform: `translate(${x} ${y})` }));
    return s(
      "svg",
      { class: "mascot", viewBox: "0 -16 64 90", "aria-hidden": "true" },
      s("ellipse", { class: "shadow", cx: 32, cy: 70, rx: 15, ry: 3 }),
      s(
        "g",
        { class: "bob" },
        s("ellipse", { class: "foot", cx: 25, cy: 62.5, rx: 6, ry: 3.6 }),
        s("ellipse", { class: "foot", cx: 39, cy: 62.5, rx: 6, ry: 3.6 }),
        s("circle", { class: "limb arm-l", cx: 12, cy: 42, r: 4.6 }),
        s("circle", { class: "limb arm-r", cx: 52, cy: 42, r: 4.6 }),
        s(
          "g",
          { class: "flame-wrap" },
          s("path", { class: "f0 flame", d: "M22 10 C21 5 24 4 24 -1 C28 1 28 6 27 11 Z" }),
          s("path", { class: "f0 flame", d: "M42 10 C43 5 40 4 40 -1 C36 1 36 6 37 11 Z" }),
          s("path", { class: "f1 flame", d: "M32 -14 C33 -7 40 -4 40 3 C40 9 36 13 32 13 C28 13 24 9 24 3 C24 -1 27 -2 28 -7 C30 -5 31 -8 32 -14 Z" }),
          s("path", { class: "f2 flame", d: "M32 -5 C33 -1 37 1 37 6 C37 10 34.5 12 32 12 C29.5 12 27 10 27 6 C27 3 30 1.5 32 -5 Z" }),
          s("path", { class: "f3 flame", d: "M32 3 C33 5 35 6.5 35 9 C35 11 33.7 12 32 12 C30.3 12 29 11 29 9 C29 7 31 6 32 3 Z" })
        ),
        s("path", { class: "top", d: "M14 24 A18 18 0 0 1 50 24 V28 H14 Z" }),
        s("path", { class: "bottom", d: "M14 28 H50 V44 A18 18 0 0 1 14 44 Z" }),
        s("path", { class: "seam", d: "M14 28 H50" }),
        s("rect", { class: "shine", x: 19, y: 11, width: 4.5, height: 13, rx: 2.2, transform: "rotate(8 21 17)" }),
        s("path", { class: "outline", d: "M14 24 A18 18 0 0 1 50 24 V44 A18 18 0 0 1 14 44 Z" }),
        s(
          "g",
          { class: "eyes" },
          s(
            "g",
            { class: "eye-open" },
            s("ellipse", { class: "eye", cx: 25.5, cy: 38, rx: 3.1, ry: 4 }),
            s("circle", { class: "eye-shine", cx: 26.6, cy: 36.4, r: 1.2 }),
            s("ellipse", { class: "eye", cx: 38.5, cy: 38, rx: 3.1, ry: 4 }),
            s("circle", { class: "eye-shine", cx: 39.6, cy: 36.4, r: 1.2 })
          ),
          s("path", { class: "eye-happy", d: "M22.3 39.5 Q25.5 34 28.7 39.5 M35.3 39.5 Q38.5 34 41.7 39.5" })
        ),
        s("ellipse", { class: "cheek", cx: 20, cy: 44.5, rx: 3.3, ry: 2 }),
        s("ellipse", { class: "cheek", cx: 44, cy: 44.5, rx: 3.3, ry: 2 }),
        s("path", { class: "mouth mouth-smile", d: "M28.5 46 Q32 50 35.5 46" }),
        s("path", { class: "mouth-open", d: "M27.5 45 Q32 54 36.5 45 Z" }),
        s("path", { class: "mouth mouth-wavy", d: "M27.5 48.5 Q29.7 45.5 32 48.5 T36.5 48.5" }),
        s("path", { class: "sweat", d: "M49 14 Q53 21 49 24 Q45 21 49 14Z" }),
        ...sparks
      )
    );
  }
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = String(v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== false && v !== void 0) el.setAttribute(k, String(v));
    }
    for (const k of kids) if (k) el.append(k);
    return el;
  }
  var HotswapUI = class {
    host;
    root;
    panel;
    body;
    toastEl = null;
    toastTimer = 0;
    preset = "standard";
    busy = null;
    result = null;
    saved = [];
    probe = false;
    chip;
    tempMood = null;
    moodTimer = 0;
    site;
    handlers;
    constructor(site, handlers) {
      this.site = site;
      this.handlers = handlers;
      this.host = document.createElement("hotswap-root");
      this.root = this.host.attachShadow({ mode: "open" });
      this.root.append(h("style", {}, CSS));
      this.chip = h("button", { class: "chip", "data-testid": "hotswap-chip", "data-mood": "idle", "aria-label": "Open Hotswap", title: "Hotswap", onclick: () => this.toggle() }, h("div", { class: "bubble" }, "Limit hit? Grab it!"), mascot());
      this.body = h("div");
      this.panel = h("div", { class: "panel", role: "dialog", "aria-label": "Hotswap", "data-testid": "hotswap-panel" }, this.body);
      this.root.append(this.panel, this.chip);
      this.render();
    }
    mount() {
      document.documentElement.append(this.host);
    }
    open() {
      this.panel.classList.add("open");
    }
    close() {
      this.panel.classList.remove("open");
    }
    toggle() {
      this.panel.classList.toggle("open");
    }
    isOpen() {
      return this.panel.classList.contains("open");
    }
    setPreset(p) {
      this.preset = p;
      this.render();
    }
    setBusy(text) {
      this.busy = text;
      this.render();
      this.refreshMood();
    }
    setSaved(list) {
      this.saved = list;
      this.render();
    }
    setProbe(on) {
      this.probe = on;
      this.render();
    }
    showResult(summary, md) {
      this.result = { summary, md };
      this.busy = null;
      this.render();
      this.flash("happy", 2400);
    }
    // the mascot's mood: busy while reading, otherwise a short happy / oops / alert moment, then back to idle
    flash(m, ms) {
      clearTimeout(this.moodTimer);
      this.tempMood = m;
      this.chip.dataset.mood = "idle";
      void this.chip.offsetWidth;
      this.refreshMood();
      this.moodTimer = window.setTimeout(() => {
        this.tempMood = null;
        this.refreshMood();
      }, ms);
    }
    refreshMood() {
      this.chip.dataset.mood = this.busy ? "busy" : this.tempMood ?? "idle";
    }
    toast(text, actions = [], kind = "info", ms = 9e3) {
      this.toastEl?.remove();
      clearTimeout(this.toastTimer);
      const row = actions.length ? h("div", { class: "row" }, ...actions.map((a) => h("button", { class: a.primary ? "primary" : "", onclick: () => {
        this.toastEl?.remove();
        a.run();
      } }, a.label))) : null;
      this.toastEl = h("div", { class: `toast ${kind}`, role: "status", "data-testid": "hotswap-toast" }, h("div", {}, text), row);
      this.root.append(this.toastEl);
      if (kind === "error") this.flash("oops", 3200);
      else if (actions.length) this.flash("alert", ms);
      else this.flash("happy", 2400);
      this.toastTimer = window.setTimeout(() => this.toastEl?.remove(), ms);
    }
    render() {
      const hd = this.handlers;
      const select = h(
        "select",
        { "data-testid": "hotswap-preset", "aria-label": "How much to carry word for word", onchange: (e) => {
          this.preset = e.target.value;
        } },
        ...[["minimal", "Short (last 3 turns)"], ["standard", "Standard (last 10)"], ["verbose", "Long (last 20)"], ["full", "Everything"]].map(([v, l]) => h("option", { value: v, ...v === this.preset ? { selected: "selected" } : {} }, l))
      );
      const capture = h("button", { class: "primary", "data-testid": "hotswap-capture", disabled: this.busy ? "disabled" : false, onclick: () => hd.capture(this.preset) }, this.busy ? "Reading..." : "Capture this chat");
      const kids = [
        h("h2", {}, h("span", { class: "brand" }, mascot(), "Hotswap", h("span", { class: "site" }, `on ${this.site}`)), h("button", { class: "x", "aria-label": "Close", onclick: () => this.close() }, "\xD7")),
        h("h3", {}, h("b", {}, "1"), "Capture"),
        h("div", { class: "row" }, select, capture),
        h("div", { class: "status", "data-testid": "hotswap-status", "aria-live": "polite" }, this.busy ?? ""),
        this.busy ? h("div", { class: "bar" }, h("i")) : null
      ];
      if (this.result) kids.push(this.resultCard(this.result));
      kids.push(h("h3", {}, "Saved capsules"));
      if (!this.saved.length) kids.push(h("div", { class: "note" }, "Nothing saved yet. Capture a chat and press Save."));
      for (const s2 of this.saved.slice(0, 5)) {
        kids.push(h(
          "div",
          { class: "saved", "data-testid": "hotswap-saved" },
          h("span", { class: "title" }, h("span", { class: "pillicon" }), h("span", {}, `${s2.title || "Untitled"} `, h("small", {}, `${s2.site} \xB7 ${s2.tier} \xB7 ${(s2.bytes / 1024).toFixed(0)} KB`))),
          h(
            "span",
            { class: "row" },
            h("button", { "data-testid": "hotswap-insert-saved", onclick: () => hd.insertSaved(s2.id) }, "Insert here"),
            h("button", { onclick: () => hd.copySaved(s2.id) }, "Copy"),
            h("button", { "aria-label": "Delete", onclick: () => hd.deleteSaved(s2.id) }, "\xD7")
          )
        ));
      }
      kids.push(h("div", { class: "foot" }, "Hotswap never sends anything: it fills the message box and you press Enter. Everything stays on this computer.", this.probe ? h("div", {}, h("button", { class: "link", onclick: () => hd.probeReport() }, "Copy probe report (no chat text)")) : null));
      this.body.replaceChildren(...kids.filter((k) => !!k));
    }
    resultCard({ summary: s2, md }) {
      const hd = this.handlers;
      const drag = h("div", { class: "drag", draggable: "true", "data-testid": "hotswap-drag", title: "Drag this onto the message box of another AI" }, h("span", { class: "pillicon" }), "Drag this capsule into another chat");
      drag.addEventListener("dragstart", (e) => {
        const p = hd.dragPayload();
        if (!p || !e.dataTransfer) return;
        e.dataTransfer.setData("text/plain", p.text);
        e.dataTransfer.setData("text/markdown", p.text);
        e.dataTransfer.effectAllowed = "copy";
      });
      return h(
        "div",
        { class: "card", "data-testid": "hotswap-result" },
        h("div", {}, h("span", { class: `tier ${s2.tier === "partial" ? "partial" : ""}` }, s2.tier), ` ${s2.turns} turns read, ${s2.tail} word for word`),
        h(
          "ul",
          {},
          h("li", {}, `${s2.codeBlocks} code block(s) kept exactly`),
          h("li", {}, `Secrets removed: ${s2.secrets}`),
          h("li", {}, s2.complete)
        ),
        ...s2.notes.slice(0, 3).map((n) => h("div", { class: "note" }, n)),
        h("h3", {}, h("b", {}, "2"), "Continue elsewhere"),
        h(
          "div",
          { class: "row" },
          h("button", { class: "primary", "data-testid": "hotswap-insert", onclick: () => hd.insertCurrent() }, "Insert into this chat"),
          h("button", { "data-testid": "hotswap-copy", onclick: () => hd.copyCurrent() }, "Copy"),
          h("button", { "data-testid": "hotswap-download", onclick: () => hd.downloadCurrent() }, "Download .md"),
          h("button", { "data-testid": "hotswap-save", onclick: () => hd.saveCurrent() }, "Save"),
          h("button", { "data-testid": "hotswap-attach", onclick: () => hd.attachCurrent() }, "Attach as file")
        ),
        drag,
        h("textarea", { readonly: "readonly", "data-testid": "hotswap-preview", "aria-label": "Capsule preview" }, md)
      );
    }
  };

  // extension/src/content/index.ts
  var adapter = pickAdapter(location, document, true);
  if (adapter && !document.querySelector("hotswap-root")) start(adapter);
  function start(a) {
    let current = null;
    let probe = false;
    let preset = "standard";
    const file = () => `hotswap-${a.id}-${current?.capsule.id ?? "capsule"}.hotswap.md`;
    const log = (kind, data) => {
      if (probe) void probeLog({ site: a.id, kind, data });
    };
    const toStored = (c, md) => ({ id: c.id, createdAt: c.createdAt, title: c.source.title ?? "Untitled chat", site: a.name, tier: c.fidelity.tier, turns: c.fidelity.messagesRead, bytes: new TextEncoder().encode(md).length, text: md });
    const refreshSaved = async () => ui.setSaved(await listCapsules());
    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    async function insert(text, label) {
      const box = a.composer(document);
      if (!box) {
        const ok = await copy(text);
        ui.toast(`Could not find the message box on this page. ${ok ? "The capsule is on your clipboard: paste it with Ctrl+V." : "Use Copy instead."}`, [], "error");
        log("inject", { ok: false, reason: "no composer", health: a.selectorHealth(document) });
        return;
      }
      const r = await insertText(box, text);
      log("inject", { ok: r.ok, technique: r.technique, tried: r.tried, size: text.length, health: a.selectorHealth(document) });
      if (r.ok) ui.toast(`${label} inserted into the message box. Read it, then press Enter yourself.`);
      else {
        const ok = await copy(text);
        ui.toast(`Could not insert it automatically. ${ok ? "It is on your clipboard: click the message box and paste with Ctrl+V." : "Use Copy and paste it yourself."}`, [], "error");
      }
    }
    async function capture(p) {
      preset = p;
      ui.setBusy("Reading this conversation...");
      try {
        const { messages, flags } = await captureMessages(a, document, { onProgress: (t) => ui.setBusy(t) });
        if (!messages.length) {
          ui.setBusy(null);
          log("capture", { ok: false, health: a.selectorHealth(document) });
          ui.toast("No messages were found on this page. Open a conversation first. (If you are in one, this site may have changed; the probe report in the panel footer helps fix that.)", [], "error");
          return;
        }
        const session = toSession(a, document, location, messages, flags);
        const capsule = buildCapsule(session, { preset: p });
        const md = renderCapsule(capsule);
        current = { capsule, md };
        const f = capsule.fidelity;
        const red = Object.entries(f.redactions).map(([k, v]) => `${v} ${k}`).join(", ");
        ui.showResult({
          turns: f.messagesRead,
          tail: f.messagesInTail,
          codeBlocks: f.codeBlocksInVault,
          secrets: red || "none found",
          tier: f.tier,
          complete: flags.reachedTop === true ? "Read from the start of the conversation" : `The start of the conversation was not clearly reached (${flags.stoppedBecause})`,
          notes: f.notes
        }, md);
        log("capture", { ok: true, turns: f.messagesRead, codeBlocks: f.codeBlocksFound, flags, health: a.selectorHealth(document) });
      } catch (e) {
        ui.setBusy(null);
        ui.toast(`Capture failed: ${e.message}`, [], "error");
      }
    }
    const ui = new HotswapUI(a.name, {
      capture: (p) => void capture(p),
      insertCurrent: () => {
        if (current) void insert(current.md, "The capsule");
      },
      attachCurrent: async () => {
        if (!current) return;
        const box = a.composer(document);
        if (!box) {
          ui.toast("Could not find the message box on this page.", [], "error");
          return;
        }
        await attachFile(box, file(), current.md);
        log("inject", { ok: "attempted", technique: "file-paste-and-drop" });
        ui.toast("Attached as a file (tried paste and drop). If no file shows up in the message box, use Insert or Copy instead.");
      },
      copyCurrent: async () => {
        if (current) ui.toast(await copy(current.md) ? "Copied. Paste it into the other AI." : "The browser blocked copying. Use Download instead.");
      },
      downloadCurrent: () => {
        if (!current) return;
        const url = URL.createObjectURL(new Blob([current.md], { type: "text/markdown" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = file();
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2e3);
      },
      saveCurrent: async () => {
        if (!current) return;
        await saveCapsule(toStored(current.capsule, current.md));
        await refreshSaved();
        ui.toast('Saved. Open another chat and press "Insert here".');
      },
      insertSaved: async (id) => {
        const s2 = (await listCapsules()).find((x) => x.id === id);
        if (s2) await insert(s2.text, "The saved capsule");
      },
      copySaved: async (id) => {
        const s2 = (await listCapsules()).find((x) => x.id === id);
        if (s2) ui.toast(await copy(s2.text) ? "Copied." : "The browser blocked copying.");
      },
      deleteSaved: async (id) => {
        await deleteCapsule(id);
        await refreshSaved();
      },
      dragPayload: () => current ? { text: current.md, name: file() } : null,
      probeReport: async () => {
        const report = { extension: chrome.runtime.getManifest().version, site: a.id, host: location.hostname, health: a.selectorHealth(document), entries: await getProbe() };
        ui.toast(await copy(JSON.stringify(report, null, 2)) ? "Probe report copied. It holds counts, techniques and banner text only, no chat text." : "Could not copy the probe report.");
      }
    });
    ui.mount();
    void refreshSaved();
    void getSettings().then((s2) => {
      probe = s2.probe;
      preset = s2.preset;
      ui.setPreset(s2.preset);
      ui.setProbe(s2.probe);
      log("adapter", { health: a.selectorHealth(document), url: location.pathname.split("/")[1] ?? "" });
      if (s2.limitHints) {
        watchLimits(document, (text) => {
          log("limit", { text: text.slice(0, 300) });
          ui.toast("This looks like a usage limit (experimental). Capture this chat now so you can continue in another AI.", [{ label: "Capture now", primary: true, run: () => {
            ui.open();
            void capture(preset);
          } }], "info", 2e4);
        });
      }
    });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.settings) {
        const s2 = ch.settings.newValue;
        probe = !!s2?.probe;
        ui.setProbe(probe);
      }
      if (ch.capsules) void refreshSaved();
    });
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "hotswap:open") ui.open();
      else if (msg?.type === "hotswap:capture") {
        ui.open();
        void capture(preset);
      } else if (msg?.type === "hotswap:insert-latest") void latestCapsule().then((s2) => s2 ? insert(s2.text, "The latest saved capsule") : ui.toast("No saved capsule yet. Capture a chat and press Save first.", [], "error"));
      else if (msg?.type === "hotswap:insert" && msg.id) void listCapsules().then((l) => {
        const s2 = l.find((x) => x.id === msg.id);
        if (s2) void insert(s2.text, "The saved capsule");
      });
    });
  }
})();
