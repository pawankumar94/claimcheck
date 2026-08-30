import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentProfile, RawRecord, TasksDoc } from "../types.js";
import { invokeAgent } from "../agents/invoke.js";
import { expandFiles } from "./claims.js";

const execFileAsync = promisify(execFile);

export interface RunOptions {
  tasksDoc: TasksDoc;
  agents: AgentProfile[];
  policyNames: string[];
  outDir: string;
  trials?: number;
  /**
   * Directory that `fixture_dir` and `policy_overlays` are resolved against --
   * normally the directory holding the tasks.json, so a task set can ship its
   * fixture next to itself and stay relocatable.
   */
  baseDir?: string;
  onRecord?: (record: RawRecord) => void;
}

async function freshCheckout(repoUrl: string, sha: string, tmpRoot: string): Promise<string> {
  const checkout = join(tmpRoot, "repo");
  await execFileAsync("git", ["clone", "--quiet", repoUrl, checkout]);
  await execFileAsync("git", ["checkout", "--quiet", sha], { cwd: checkout });
  return checkout;
}

function resolveFrom(baseDir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(baseDir, p);
}

/**
 * Builds the workspace one invocation sees: the fixture app, then the policy's
 * overlay on top. The overlay is the entire manipulation in the honor eval --
 * `with-tickets` drops a `.diedinchat/` into the tree, `no-tickets` drops
 * nothing -- so it must be applied per invocation, never once up front, or the
 * arms would contaminate each other.
 */
async function seedWorkspace(
  workDir: string,
  tasksDoc: TasksDoc,
  policyName: string,
  baseDir: string
): Promise<void> {
  if (tasksDoc.fixture_dir) {
    const src = resolveFrom(baseDir, tasksDoc.fixture_dir);
    if (!existsSync(src)) throw new Error(`fixture_dir does not exist: ${src}`);
    await cp(src, workDir, { recursive: true });
  }

  const overlay = tasksDoc.policy_overlays?.[policyName];
  if (overlay) {
    const src = resolveFrom(baseDir, overlay);
    // An arm that deliberately adds nothing is spelled as a missing directory
    // (git will not track an empty one), so absence is not an error.
    if (existsSync(src)) await cp(src, workDir, { recursive: true });
  }
}

/**
 * Reads back the paths a task declares in `inspect`, after the agent has had
 * its turn. This is the evidence honor is scored on: an agent that describes
 * the rule correctly and then writes code that breaks it must still count as a
 * violation, and only the files can show that.
 */
async function captureWorkspace(workDir: string, inspect: string[]): Promise<string> {
  // expandFiles skips `.diedinchat/`, which matters here: the ticket text
  // restates the rule, so including it would make the honor criteria match
  // the ticket rather than the agent's code.
  const files = await expandFiles(workDir, inspect);
  const chunks: string[] = [];
  for (const rel of files) {
    chunks.push(`--- ${rel} ---\n${await readFile(join(workDir, rel), "utf-8")}`);
  }
  return chunks.join("\n");
}

/**
 * Reads the ticket store back after the run. Used by capture experiments,
 * where the measured outcome is whether the agent wrote a ticket at all.
 */
async function captureTickets(workDir: string): Promise<string> {
  const dir = join(workDir, ".diedinchat");
  if (!existsSync(dir)) return "--- .diedinchat/ --- (no tickets)";
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (names.length === 0) return "--- .diedinchat/ --- (no tickets)";
  const parts: string[] = [];
  for (const n of names) {
    parts.push(`--- .diedinchat/${n} ---\n${await readFile(join(dir, n), "utf-8")}`);
  }
  return parts.join("\n");
}

/**
 * Runs every task x agent x policy x trial. Clones the pinned repo fresh per
 * invocation so state never leaks between runs (an agent with edit access
 * could otherwise mutate the checkout other trials see).
 */
export async function runEvaluation(opts: RunOptions): Promise<RawRecord[]> {
  const trials = opts.trials ?? 1;
  await mkdir(opts.outDir, { recursive: true });
  const records: RawRecord[] = [];

  for (const agent of opts.agents) {
    for (const policyName of opts.policyNames) {
      for (const task of opts.tasksDoc.tasks) {
        for (let trial = 0; trial < trials; trial++) {
          const tmpRoot = await mkdtemp(join(tmpdir(), "diedinchat-"));
          let record: RawRecord;
          try {
            // A task set with no repo is self-contained in its prompts; it
            // still gets a fresh empty directory so runs stay isolated.
            const workDir = opts.tasksDoc.repo_url
              ? await freshCheckout(opts.tasksDoc.repo_url, opts.tasksDoc.pinned_sha!, tmpRoot)
              : tmpRoot;
            await seedWorkspace(workDir, opts.tasksDoc, policyName, opts.baseDir ?? process.cwd());
            const promptVariant = task.prompt_by_policy?.[policyName];
            const prompt = promptVariant ?? task.prompt;
            // A policy realized in the prompt or in the workspace needs no
            // flags from the profile. Demanding a policyArgs entry anyway
            // would mean every agent profile had to be edited before it could
            // run a task set whose arms are not about tools at all.
            const realizedOutsideFlags =
              promptVariant !== undefined || opts.tasksDoc.policy_overlays !== undefined;
            const result = await invokeAgent(agent, policyName, prompt, workDir, {
              allowMissingPolicyArgs: realizedOutsideFlags,
            });

            record = {
              task_id: task.id,
              agent_name: agent.name,
              policy_name: policyName,
              trial,
              prompt,
              ok: result.ok,
              latency_ms: result.latencyMs,
              ...(result.error ? { error: result.error } : {}),
              ...(result.ok
                ? {
                    metrics: {
                      result_text: result.resultText ?? "",
                      cost: result.cost ?? null,
                      session_id: result.sessionId ?? null,
                      ...(task.inspect?.length || task.inspect_tickets
                        ? {
                            workspace_text: [
                              task.inspect?.length ? await captureWorkspace(workDir, task.inspect) : "",
                              task.inspect_tickets ? await captureTickets(workDir) : "",
                            ]
                              .filter(Boolean)
                              .join("\n"),
                          }
                        : {}),
                    },
                  }
                : {}),
            };
          } finally {
            await rm(tmpRoot, { recursive: true, force: true });
          }

          const outPath = join(opts.outDir, `${task.id}__${agent.name}__${policyName}__t${trial}.json`);
          await writeFile(outPath, JSON.stringify(record, null, 2));
          opts.onRecord?.(record);
          records.push(record);
        }
      }
    }
  }

  return records;
}
