/**
 * One acceptance criterion. Every criterion on a task must be satisfied for a
 * PASS.
 *
 * A bare string is a keyword (the original form, kept so existing task sets
 * keep working). The object forms exist because keyword-only keys reject
 * correct answers that used different words -- two independent runs found that
 * to be the dominant source of failure, ahead of anything the agent actually
 * got wrong. `any_of` lets a key enumerate acceptable phrasings up front,
 * which stays pre-registered and deterministic rather than sliding toward
 * grading to taste.
 */
export type AcceptanceCriterion =
  | string
  | { any_of: string[]; label?: string }
  | { all_of: string[]; label?: string }
  | { regex: string; flags?: string; label?: string };

export interface Task {
  id: string;
  prompt: string;
  source_files?: string[];
  /** Legacy keyword list. Use `accept` for new task sets. */
  expected_keywords?: string[];
  /** Richer acceptance criteria. Takes precedence over expected_keywords. */
  accept?: AcceptanceCriterion[];
  verified: boolean;
  note?: string;
}

export interface TasksDoc {
  repo_url: string;
  pinned_sha: string;
  note?: string;
  tasks: Task[];
}

/**
 * Agent-neutral description of a tool policy. What "curated" or "full"
 * actually looks like in flags/args is agent-specific -- see AgentProfile.
 * This is here only so a report can say what the *intent* of the policy was.
 */
export interface Policy {
  name: string;
  description: string;
}

/** How an agent profile turns raw stdout into a comparable result. */
export interface OutputSpec {
  /** "json": parse stdout as JSON and pull fields by dot-path. "text": treat raw stdout as the result. */
  type: "json" | "text";
  /** Dot-path to the answer text within the parsed JSON. Required when type is "json". */
  resultField?: string;
  /** Dot-path to a cost figure, if the agent reports one. */
  costField?: string;
  /** Dot-path to a session/run identifier, if the agent reports one. */
  sessionIdField?: string;
}

/**
 * Describes how to drive one coding-agent CLI. This is the entire
 * agent-agnosticism mechanism: adding support for a new agent is writing one
 * of these, not writing new code. See profiles/claude-code.json for a
 * verified example and examples/agent-profiles/ for unverified templates.
 */
export interface AgentProfile {
  name: string;
  description?: string;
  /** Executable to run, e.g. "claude". Resolved via PATH. */
  command: string;
  /** Args that appear before the prompt, on every invocation. */
  baseArgs: string[];
  /** Args appended after the prompt, on every invocation (e.g. output-format flags). */
  extraArgs?: string[];
  /**
   * Where the prompt goes. "after-base" (default): as an arg right after
   * baseArgs, before policyArgs/extraArgs -- matches `claude --bare -p
   * "<prompt>" --allowedTools ...`. "end": appended after everything else.
   * "stdin": not passed as an arg at all, written to the process's stdin
   * instead -- for CLIs that read the prompt from stdin.
   */
  promptPlacement?: "after-base" | "end" | "stdin";
  /**
   * Maps a policy name (e.g. "curated", "full") to the exact args this agent
   * needs to implement that policy. This is the part every agent gets to
   * define for itself -- tool names and flag syntax are not standardized
   * across coding agents.
   */
  policyArgs: Record<string, string[]>;
  output: OutputSpec;
  /** Milliseconds before the invocation is killed and scored as a timeout. Default 300000. */
  timeoutMs?: number;
  verified?: boolean;
  verificationNote?: string;
}

export interface InvocationResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  resultText?: string;
  cost?: number | null;
  sessionId?: string | null;
  rawStdout?: string;
}

export interface RawRecord {
  task_id: string;
  agent_name: string;
  policy_name: string;
  trial: number;
  prompt: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
  metrics?: {
    result_text: string;
    cost: number | null;
    session_id: string | null;
  };
}

export interface ScoredRecord extends RawRecord {
  score: string;
  missing_keywords: string[] | null;
}
