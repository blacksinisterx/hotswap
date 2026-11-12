// The shapes every reader produces and every writer consumes. Plain data only, so tests can build them by hand.

export type Role = 'user' | 'assistant';
export type ToolName = 'claude-code' | 'antigravity' | 'chatgpt' | 'claude-ai' | 'gemini';

/** One thing the AI did with a tool (ran a command, edited a file, ...). */
export interface ToolEvent {
  name: string;
  /** One short line, for example the command or the file path. */
  summary: string;
  /** Files this event wrote (edit, write). Reads are not listed here. */
  written: string[];
  read: string[];
  command?: string;
  /** Result known? true = ok, false = failed. */
  ok?: boolean;
  result?: string;
}

/** One turn. Consecutive assistant entries are merged into one turn. */
export interface Message {
  id: string;
  role: Role;
  ts?: string;
  text: string;
  /** The source tool itself cut this message short (Antigravity does, at about 1,000 characters). */
  truncated?: boolean;
  tools: ToolEvent[];
  /** Images or documents that were attached and cannot travel in a text capsule. */
  attachments?: string[];
}

export interface Todo { text: string; status: 'pending' | 'in_progress' | 'completed' }
export interface Artifact { name: string; text: string; truncated: boolean }

export interface LimitInfo {
  kind: 'rate_limit';
  text: string;
  /** For example "11:40am (Asia/Karachi)". */
  resets?: string;
  at?: string;
  /** True when nothing but this notice came after the last real turn: the session is stuck on it right now. */
  isLatest: boolean;
}

export interface Source {
  tool: ToolName;
  sessionId: string;
  title?: string;
  /** File the session was read from. */
  path: string;
  startedAt?: string;
  endedAt?: string;
}

/** What a reader returns. */
export interface Session {
  source: Source;
  cwd?: string;
  gitBranch?: string;
  messages: Message[];
  todos: Todo[];
  artifacts: Artifact[];
  limit?: LimitInfo;
  /** Plain-words remarks about what could not be read or was cut. They end up in the fidelity report. */
  notes: string[];
  /** The reader could not be sure it saw everything (a web page whose start was never reached). */
  incomplete?: boolean;
}

export interface SessionInfo {
  tool: ToolName;
  id: string;
  path: string;
  mtimeMs: number;
  bytes: number;
  /** Working folder, when it is cheap to know. */
  cwd?: string;
  title?: string;
}
