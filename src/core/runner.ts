import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentProfile, RawRecord, TasksDoc } from "../types.js";
import { invokeAgent } from "../agents/invoke.js";

const execFileAsync = promisify(execFile);

export interface RunOptions {
  tasksDoc: TasksDoc;
  agents: AgentProfile[];
  policyNames: string[];
  outDir: string;
  trials?: number;
  onRecord?: (record: RawRecord) => void;
}

async function freshCheckout(repoUrl: string, sha: string, tmpRoot: string): Promise<string> {
  const checkout = join(tmpRoot, "repo");
  await execFileAsync("git", ["clone", "--quiet", repoUrl, checkout]);
  await execFileAsync("git", ["checkout", "--quiet", sha], { cwd: checkout });
  return checkout;
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
          const tmpRoot = await mkdtemp(join(tmpdir(), "claimcheck-"));
          let record: RawRecord;
          try {
            // A task set with no repo is self-contained in its prompts; it
            // still gets a fresh empty directory so runs stay isolated.
            const workDir = opts.tasksDoc.repo_url
              ? await freshCheckout(opts.tasksDoc.repo_url, opts.tasksDoc.pinned_sha!, tmpRoot)
              : tmpRoot;
            const promptVariant = task.prompt_by_policy?.[policyName];
            const prompt = promptVariant ?? task.prompt;
            const result = await invokeAgent(agent, policyName, prompt, workDir, {
              allowMissingPolicyArgs: promptVariant !== undefined,
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
