// Removes secrets before anything is written. It never returns the original on failure: callers get an exception
// and must not export. Only counts are kept, never the secret itself.

export interface Redaction { text: string; hits: Record<string, number> }

interface Rule { kind: string; pattern: RegExp; replace?: (m: string, ...g: string[]) => string }

const R = (kind: string) => `[REDACTED:${kind}]`;

export const RULES: Rule[] = [
  { kind: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'openai-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: 'github-token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/g },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'stripe-key', pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: 'bearer-token', pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}/g, replace: (_m, pre) => `${pre}${R('bearer-token')}` },
  { kind: 'url-password', pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)[^/\s@]{3,}(@)/gi, replace: (_m, pre, at) => `${pre}${R('url-password')}${at}` },
  // NAME=value (.env lines, exports, or inline in a sentence) where the NAME says it is a secret.
  // A value that is only a reference (process.env.X, $X, ${X}, <placeholder>, a call) is not a secret and is kept.
  {
    kind: 'env-secret',
    pattern: /((?<![A-Za-z0-9_])(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL)[A-Z0-9_]*\s*[=:]\s*)(["']?)(?!process\.|import\.meta|os\.|env\.|getenv|\$|\{|<|\[)[^\s"'#,;)(]{6,}\2/g,
    replace: (_m, pre, q) => `${pre}${q}${R('env-secret')}${q}`,
  },
];

/** `seen` lets a caller count each distinct secret once even if it appears in several places. */
export function redact(text: string, rules: Rule[] = RULES, seen?: Set<string>): Redaction {
  if (typeof text !== 'string') throw new TypeError('redact() needs a string');
  const hits: Record<string, number> = {};
  let out = text;
  for (const rule of rules) {
    out = out.replace(rule.pattern, (...args) => {
      const key = `${rule.kind}|${args[0] as string}`;
      if (!seen?.has(key)) { hits[rule.kind] = (hits[rule.kind] ?? 0) + 1; seen?.add(key); }
      return rule.replace ? rule.replace(args[0] as string, ...(args.slice(1) as string[])) : R(rule.kind);
    });
  }
  return { text: out, hits };
}

export function mergeHits(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

export type Redactor = (text: string) => Redaction;
