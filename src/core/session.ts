import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RawRecord, TasksDoc } from "../types.js";

/**
 * In-agent evaluation sessions.
 *
 * The subprocess pipeline (runner.ts) spawns an agent CLI and parses its
 * stdout, which forces a per-agent profile of flags and output formats. This
 * module is the portable alternative: the agent you are already talking to
 * answers the tasks itself through MCP tools, and diedinchat only stores and
 * scores. Nothing here knows what agent is on the other end, so it works
 * identically in every MCP client.
 *
 * The trade is that diedinchat does not enforce the tool restriction -- the
 * user does, by changing their real configuration between runs. That is
 * stronger evidence than a simulated restriction, but only if the run records
 * honestly what configuration it was taken under, which is why `configNote`
 * is required rather than optional.
 */

export interface SessionAnswer {
  task_id: string;
  answer_text: string;
  latency_ms?: number;
  answered_at: string;
}

export interface RunSession {
  id: string;
  /** Human label for the condition, e.g. "all-mcp-servers" or "read-only". */
  label: string;
  /** What the user changed for this run. Required: an unlabelled condition is not a condition. */
  configNote: string;
  /** Which agent answered, as reported by the client. Free text -- unverified. */
  agent: string;
  tasksPath: string;
  taskIds: string[];
  createdAt: string;
  answers: SessionAnswer[];
  /** True once every task has an answer. */
  complete: boolean;
}

export function diedinchatHome(): string {
  return process.env.DIEDINCHAT_HOME ?? join(homedir(), ".diedinchat");
}

function runsDir(): string {
  return join(diedinchatHome(), "runs");
}

function runPath(id: string): string {
  return join(runsDir(), `${id}.json`);
}

/** Filesystem-safe, human-scannable, and unique enough for local runs. */
export function makeRunId(label: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "run";
  return `${stamp}-${slug}`;
}

export async function saveRun(session: RunSession): Promise<void> {
  await mkdir(runsDir(), { recursive: true });
  await writeFile(runPath(session.id), JSON.stringify(session, null, 2));
}

export async function loadRun(id: string): Promise<RunSession> {
  const path = runPath(id);
  if (!existsSync(path)) {
    const available = await listRuns();
    throw new Error(
      `No run with id "${id}". Known runs: ${available.map((r) => r.id).join(", ") || "(none yet)"}.`
    );
  }
  return JSON.parse(await readFile(path, "utf-8")) as RunSession;
}

export async function listRuns(): Promise<RunSession[]> {
  if (!existsSync(runsDir())) return [];
  const files = (await readdir(runsDir())).filter((f) => f.endsWith(".json"));
  const runs = await Promise.all(files.map((f) => readFile(join(runsDir(), f), "utf-8")));
  return runs
    .map((r) => JSON.parse(r) as RunSession)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function startRun(opts: {
  label: string;
  configNote: string;
  agent: string;
  tasksPath: string;
  tasksDoc: TasksDoc;
  now?: Date;
}): Promise<RunSession> {
  const session: RunSession = {
    id: makeRunId(opts.label, opts.now),
    label: opts.label,
    configNote: opts.configNote,
    agent: opts.agent,
    tasksPath: opts.tasksPath,
    taskIds: opts.tasksDoc.tasks.map((t) => t.id),
    createdAt: (opts.now ?? new Date()).toISOString(),
    answers: [],
    complete: false,
  };
  await saveRun(session);
  return session;
}

export interface SubmitResult {
  session: RunSession;
  accepted: string[];
  unknown: string[];
  remaining: string[];
}

export async function submitAnswers(
  id: string,
  answers: Array<{ task_id: string; answer_text: string; latency_ms?: number }>,
  now: Date = new Date()
): Promise<SubmitResult> {
  const session = await loadRun(id);
  const known = new Set(session.taskIds);
  const accepted: string[] = [];
  const unknown: string[] = [];

  for (const a of answers) {
    if (!known.has(a.task_id)) {
      unknown.push(a.task_id);
      continue;
    }
    // Last write wins, so a re-answered task replaces rather than duplicates.
    session.answers = session.answers.filter((existing) => existing.task_id !== a.task_id);
    session.answers.push({
      task_id: a.task_id,
      answer_text: a.answer_text,
      ...(a.latency_ms !== undefined ? { latency_ms: a.latency_ms } : {}),
      answered_at: now.toISOString(),
    });
    accepted.push(a.task_id);
  }

  const answered = new Set(session.answers.map((a) => a.task_id));
  const remaining = session.taskIds.filter((t) => !answered.has(t));
  session.complete = remaining.length === 0;
  await saveRun(session);

  return { session, accepted, unknown, remaining };
}

/**
 * Projects a session into the same RawRecord shape the subprocess pipeline
 * produces, so scoring, analysis, and reporting are shared rather than
 * reimplemented -- an in-agent run and a subprocess run are held to identical
 * standards.
 */
export function sessionToRecords(session: RunSession): RawRecord[] {
  return session.answers.map((a) => ({
    task_id: a.task_id,
    agent_name: session.agent,
    policy_name: session.label,
    trial: 0,
    prompt: "",
    ok: true,
    latency_ms: a.latency_ms ?? 0,
    metrics: { result_text: a.answer_text, cost: null, session_id: session.id },
  }));
}
