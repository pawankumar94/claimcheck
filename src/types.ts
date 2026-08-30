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
  /**
   * An alternative may itself be a conjunction. An array-valued argument has
   * several acceptable orderings and spellings, and each of those is a set of
   * substrings that must all appear, so a flat string list cannot express it.
   */
  | { any_of: Array<string | { all_of: string[] }>; label?: string }
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
  /**
   * Per-policy prompt variants. When present, the runner sends the variant
   * matching the policy under test instead of `prompt`.
   *
   * This is what lets a policy be any controlled variable rather than only a
   * set of CLI flags. Some variables -- how many tools are described to the
   * model, how much context it is given -- live in the prompt, and cannot be
   * expressed as flags on any agent.
   */
  prompt_by_policy?: Record<string, string>;
  /**
   * Repo-relative paths whose post-run contents are captured into
   * `metrics.workspace_text`. Required for honor scoring: what the agent
   * *wrote to the files* is the evidence, not what it said in chat.
   */
  /**
   * Human-readable name for reports and charts. Task ids are stable slugs meant
   * for filenames and joins; a reader of a chart should see the rule, not
   * `i1-generated-config`.
   */
  label?: string;
  inspect?: string[];
  /**
   * Append the repo's ticket store to `metrics.workspace_text` after the run.
   *
   * `inspect` deliberately skips `.diedinchat/`, so honor scoring cannot match
   * the ticket text instead of the agent's code. Capture experiments need the
   * opposite: the question is whether a ticket appeared at all, so the store
   * has to be the thing that gets read.
   */
  inspect_tickets?: boolean;
  /**
   * Honor criteria, scored against `metrics.workspace_text` rather than the
   * agent's prose. A task is HONORED when nothing in `forbid` appears and
   * everything in `require` does. This is the ticket eval: the question is
   * whether the agent obeyed a pinned constraint it was never told in chat.
   */
  honor?: HonorSpec;
  verified: boolean;
  note?: string;
}

/**
 * `forbid` is the pattern the ticket exists to prevent (auth in a route
 * handler, SQL outside `src/db/`). `require` is the shape the ticket asks
 * for instead. Both are pre-registered from the fixture before any run, the
 * same freeze rule as `accept`.
 */
export interface HonorSpec {
  forbid?: AcceptanceCriterion[];
  require?: AcceptanceCriterion[];
}

export interface TasksDoc {
  /**
   * Repo to clone fresh for each invocation. Omit for task sets that are
   * self-contained in the prompt (an imported benchmark, for instance), in
   * which case each invocation runs in an empty temporary directory.
   */
  repo_url?: string;
  pinned_sha?: string;
  note?: string;
  /** Where this task set came from, for task sets not authored here. */
  source?: { name: string; url?: string; license?: string; note?: string };
  /**
   * Directory copied fresh into each invocation's workspace, resolved
   * relative to the tasks.json. This is the alternative to `repo_url` for a
   * task set that ships its own small fixture app instead of cloning one.
   */
  fixture_dir?: string;
  /**
   * Per-policy directories overlaid on top of the fixture, resolved the same
   * way. This is how a condition becomes "the repo has tickets in it": the
   * `with-tickets` overlay carries a `.diedinchat/`, the `no-tickets` overlay
   * carries nothing. Same tasks, same prompts, one thing different.
   */
  policy_overlays?: Record<string, string>;
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
    /** Post-run contents of the task's `inspect` paths. Honor is scored on this. */
    workspace_text?: string;
  };
}

export interface ScoredRecord extends RawRecord {
  score: string;
  missing_keywords: string[] | null;
}

export type ClaimStatus = "open" | "supported" | "contradicted" | "stale" | "closed";

/**
 * An assertion pinned to paths in this repo. Lives in `.diedinchat/<id>.json` so
 * it survives session end and agent-switch. `status` is derived from file
 * hashes (stale) and frozen evidence (supported / contradicted). Missing
 * evidence is contradicted even when the cited file also changed; `open` means
 * the files have not moved and no evidence was registered to check.
 */
export interface FileClaim {
  id: string;
  text: string;
  files: string[];
  evidence: AcceptanceCriterion[];
  status: ClaimStatus;
  /** sha256 of each file under `files` at pin time. Directory paths expand. */
  hashes: Record<string, string>;
  agent?: string;
  /** Closed tickets remain auditable on disk but are hidden from default status. */
  closed_at?: string;
  created_at: string;
  updated_at: string;
}
