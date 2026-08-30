import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { loadTasksDoc } from "./core/tasks.js";
import {
  builtinExampleTasksPath,
  describeBuiltinProfiles,
  listBuiltinExamples,
  resolveAgentProfile, VERSION } from "./core/resolve.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import { loadRun, sessionToRecords, startRun, submitAnswers } from "./core/session.js";
import { checkClaim, closeClaim, pinClaim, statusClaims, unpinClaim } from "./core/claims.js";
import type { RawRecord } from "./types.js";


/**
 * Exposes diedinchat's pipeline as MCP tools so any MCP-capable coding agent
 * (Claude Code, Cursor, Codex, Windsurf, Zed, ...) can install it as a plugin
 * and run an evaluation itself -- including pointing it at its own agent
 * profile to measure its own configuration.
 *
 * Agents are referred to by built-in name or by path, never by a path the
 * caller has to guess: an agent invoking this over stdio has no idea where
 * npm installed the package, so `list_agent_profiles` exists for discovery.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "diedinchat", version: VERSION });

  server.registerTool(
    "list_agent_profiles",
    {
      title: "List available agent profiles and example task sets",
      description:
        "Discovery entry point -- call this first. Lists the agent profiles bundled with diedinchat " +
        "(each with the policy names it supports and whether its CLI flags have been verified against " +
        "a live install), plus the example task sets shipped with the package. Use the returned names " +
        "directly as `agents` and `example` arguments to run_evaluation.",
      inputSchema: {},
    },
    async () => {
      const [profiles, examples] = await Promise.all([describeBuiltinProfiles(), listBuiltinExamples()]);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ agentProfiles: profiles, exampleTaskSets: examples }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "pin_claim",
    {
      title: "Pin an assertion to files",
      description:
        "Writes a ticket to .diedinchat/<id>.json bound to the given files. Use this whenever you assert " +
        "something about the repo that the next session or a different agent will need. Do not leave " +
        "that sentence only in chat.",
      inputSchema: {
        text: z.string().describe("The assertion"),
        files: z.array(z.string()).min(1).describe("File or directory paths relative to the project root"),
        id: z.string().optional().describe("Ticket id; default is a slug of text"),
        evidence: z
          .array(z.string())
          .optional()
          .describe("Frozen phrases that must remain in the files for the ticket to stay supported"),
        agent: z.string().optional(),
        root: z.string().optional().describe("Project root. Defaults to the current working directory."),
      },
    },
    async ({ text, files, id, evidence, agent, root }) => {
      const { claim, path, action } = await pinClaim({
        root: root ?? process.cwd(),
        text,
        files,
        ...(id ? { id } : {}),
        ...(agent ? { agent } : {}),
        ...(evidence && evidence.length > 0 ? { evidence } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ action, path, claim }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_claims_for_file",
    {
      title: "List tickets on a file",
      description:
        "Call this before editing a path. Returns tickets whose files cover that path, with live status " +
        "(open / supported / contradicted / stale). Omit path to list every ticket in the repo.",
      inputSchema: {
        path: z.string().optional().describe("File or directory to filter by"),
        root: z.string().optional().describe("Project root. Defaults to the current working directory."),
        includeClosed: z
          .boolean()
          .optional()
          .describe("Include closed tickets. Closed tickets are hidden by default."),
      },
    },
    async ({ path, root, includeClosed }) => {
      const evals = await statusClaims(root ?? process.cwd(), path, includeClosed ?? false);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              evals.map((e) => ({
                id: e.claim.id,
                text: e.claim.text,
                files: e.claim.files,
                status: e.status,
                changed: e.changed,
                missingEvidence: e.missingEvidence,
                closedAt: e.claim.closed_at ?? null,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "check_claim",
    {
      title: "Re-evaluate a ticket against current files",
      description:
        "Compares frozen hashes (stale if a cited file moved) and frozen evidence (contradicted if " +
        "phrases are gone). No LLM. Pass an id, or omit to check every ticket.",
      inputSchema: {
        id: z.string().optional(),
        root: z.string().optional().describe("Project root. Defaults to the current working directory."),
      },
    },
    async ({ id, root }) => {
      const cwd = root ?? process.cwd();
      const evals = id ? [await checkClaim(cwd, id)] : await statusClaims(cwd);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              evals.map((e) => ({
                id: e.claim.id,
                status: e.status,
                evidenceVerdict: e.evidenceVerdict,
                changed: e.changed,
                missingEvidence: e.missingEvidence,
                text: e.claim.text,
                files: e.claim.files,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ---------------------------------------------------------------------
  // In-agent evaluation (lab). The calling agent answers the tasks itself.
  // ---------------------------------------------------------------------

  server.registerTool(
    "close_claim",
    {
      title: "Close a ticket without deleting it",
      description:
        "Retires a ticket whose job is done, or one that turned out to be wrong. The file and its " +
        "history stay on disk; it is hidden from list_claims_for_file unless includeClosed is set. " +
        "Prefer this over unpin_claim: a closed ticket still records that the constraint once held.",
      inputSchema: {
        id: z.string().describe("Ticket id, as returned by list_claims_for_file"),
        root: z.string().optional().describe("Project root. Defaults to the current working directory."),
      },
    },
    async ({ id, root }) => {
      const evaluated = await closeClaim(root ?? process.cwd(), id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: evaluated.claim.id,
                status: evaluated.status,
                closedAt: evaluated.claim.closed_at ?? null,
                text: evaluated.claim.text,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "unpin_claim",
    {
      title: "Delete a ticket permanently",
      description:
        "Removes .diedinchat/<id>.json. Irreversible outside git. Use close_claim instead unless the " +
        "ticket was pinned in error and should leave no trace.",
      inputSchema: {
        id: z.string().describe("Ticket id, as returned by list_claims_for_file"),
        root: z.string().optional().describe("Project root. Defaults to the current working directory."),
      },
    },
    async ({ id, root }) => {
      const removed = await unpinClaim(root ?? process.cwd(), id);
      return {
        content: [{ type: "text", text: JSON.stringify({ removed: removed.id, path: removed.path }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "start_run",
    {
      title: "Start an in-agent evaluation run",
      description:
        "Begins a run in which YOU (the calling agent) answer the tasks yourself, and returns the task " +
        "list. No subprocess is spawned and no credentials are needed. Do one run under your current " +
        "configuration, then have the user change their setup (drop MCP servers, restrict tools) and do " +
        "a second run, then call compare_runs. diedinchat does NOT enforce the restriction -- the user's " +
        "real configuration does -- so configNote must honestly describe what was in effect.",
      inputSchema: {
        label: z.string().describe('Short name for this condition, e.g. "all-tools" or "read-only"'),
        configNote: z
          .string()
          .min(10)
          .describe(
            "What configuration was actually in effect: which MCP servers were connected, which tools " +
              "were available. Be specific; this is the only record of what the run measured."
          ),
        agent: z.string().describe('Which agent is answering, e.g. "claude-code", "cursor", "hermes"'),
        tasksPath: z.string().optional(),
        example: z.string().optional().describe('Bundled task set, e.g. "claim-001-tool-count"'),
      },
    },
    async ({ label, configNote, agent, tasksPath, example }) => {
      if (!tasksPath && !example) throw new Error("Provide either `tasksPath` or `example`.");
      const resolved = tasksPath ?? builtinExampleTasksPath(example!);
      const tasksDoc = await loadTasksDoc(resolved);
      const session = await startRun({ label, configNote, agent, tasksPath: resolved, tasksDoc });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                runId: session.id,
                instructions:
                  "Answer each prompt below using only the tools you actually have right now. Do not " +
                  "look up the expected answers, and do not adjust how you answer because you know you " +
                  "are being scored. Then call submit_answers with one entry per task.",
                tasks: tasksDoc.tasks.map((t) => ({ task_id: t.id, prompt: t.prompt })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "submit_answers",
    {
      title: "Submit answers for an in-agent run",
      description:
        "Records your answers for a run started with start_run. Accepts one or many at a time; " +
        "re-answering a task replaces the previous answer. Once every task is answered the run is " +
        "scored against its pre-registered keys and a summary is returned.",
      inputSchema: {
        runId: z.string(),
        answers: z
          .array(
            z.object({
              task_id: z.string(),
              answer_text: z.string().describe("Your full answer, as you would give it to a user"),
              latency_ms: z.number().optional(),
            })
          )
          .min(1),
      },
    },
    async ({ runId, answers }) => {
      const { session, accepted, unknown, remaining } = await submitAnswers(runId, answers);
      const lines = [`Recorded ${accepted.length} answer(s) for run ${session.id} (${session.label}).`];
      if (unknown.length > 0) lines.push(`Ignored unknown task id(s): ${unknown.join(", ")}.`);

      if (!session.complete) {
        lines.push(`${remaining.length} task(s) still unanswered: ${remaining.join(", ")}.`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      const tasksDoc = await loadTasksDoc(session.tasksPath);
      const scored = scoreRecords(sessionToRecords(session), tasksDoc);
      const passes = scored.filter((r) => r.score.startsWith("PASS")).length;
      lines.push(
        `Run complete: ${passes}/${scored.length} passed.`,
        `Now change your configuration and run again with a different label, then call compare_runs.`
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "compare_runs",
    {
      title: "Compare two in-agent runs",
      description:
        "Scores two completed runs against the same pre-registered answer keys and reports whether the " +
        "difference in pass rate is distinguishable from noise, with a 95% confidence interval. Use this " +
        "to answer whether a configuration change actually helped.",
      inputSchema: {
        runIdA: z.string().describe("Baseline run, e.g. the broader configuration"),
        runIdB: z.string().describe("Candidate run, e.g. the narrower configuration"),
        outputPath: z.string().optional().describe("Optional path to also write the markdown report to"),
      },
    },
    async ({ runIdA, runIdB, outputPath }) => {
      const [a, b] = await Promise.all([loadRun(runIdA), loadRun(runIdB)]);
      if (a.tasksPath !== b.tasksPath) {
        throw new Error(
          `Runs used different task sets (${a.tasksPath} vs ${b.tasksPath}); they are not comparable.`
        );
      }
      for (const run of [a, b]) {
        if (!run.complete) throw new Error(`Run ${run.id} is incomplete; finish it before comparing.`);
      }
      if (a.label === b.label) {
        throw new Error(`Both runs are labelled "${a.label}"; distinct labels are needed to tell them apart.`);
      }

      const tasksDoc = await loadTasksDoc(a.tasksPath);
      const scored = scoreRecords([...sessionToRecords(a), ...sessionToRecords(b)], tasksDoc);
      const report = buildReport(scored, {
        baselinePolicy: a.label,
        candidatePolicy: b.label,
        preamble: [
          `Configurations compared (as reported by the client, not verified by diedinchat):`,
          `- **${a.label}** - ${a.configNote}`,
          `- **${b.label}** - ${b.configNote}`,
        ],
      });
      if (outputPath) {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, report);
      }
      return { content: [{ type: "text", text: report }] };
    }
  );

  server.registerTool(
    "run_evaluation",
    {
      title: "Run a diedinchat evaluation",
      description:
        "Runs every task in a task set against one or more agents under one or more tool policies, " +
        "writing raw JSON results to outDir. Each invocation gets a fresh checkout of the task set's " +
        "pinned repo, so state never leaks between trials. This spawns real agent CLI processes and " +
        "spends real API budget -- cost scales with tasks x agents x policies x trials. Use at least " +
        "3 trials before treating any difference between policies as real.",
      inputSchema: {
        agents: z
          .array(z.string())
          .min(1)
          .describe('Agent profile names from list_agent_profiles (e.g. "gemini-cli"), or paths to profile JSON files'),
        policies: z
          .array(z.string())
          .min(1)
          .describe('Policy names to compare, e.g. ["curated", "full"]. Every agent must define each one.'),
        tasksPath: z.string().optional().describe("Path to a tasks.json. Omit to use `example` instead."),
        example: z
          .string()
          .optional()
          .describe('Name of a bundled example task set from list_agent_profiles, e.g. "claim-001-tool-count"'),
        outDir: z.string().default("./results/raw"),
        trials: z.number().int().min(1).default(1),
      },
    },
    async ({ agents, policies, tasksPath, example, outDir, trials }) => {
      if (!tasksPath && !example) {
        throw new Error("Provide either `tasksPath` or `example` (see list_agent_profiles for example names).");
      }
      const resolvedTasksPath = tasksPath ?? builtinExampleTasksPath(example!);
      const tasksDoc = await loadTasksDoc(resolvedTasksPath);
      const profiles = await Promise.all(agents.map(resolveAgentProfile));

      const unverified = profiles.filter((p) => p.verified !== true).map((p) => p.name);
      const records = await runEvaluation({
        tasksDoc,
        agents: profiles,
        policyNames: policies,
        outDir,
        trials,
      });

      const failures = records.filter((r) => !r.ok);
      const lines = [
        `Ran ${records.length} invocations: ${tasksDoc.tasks.length} task(s) x ${profiles.length} agent(s) x ${policies.length} policy(ies) x ${trials} trial(s).`,
        `Raw results written to ${outDir}. Next: score_results with the same tasks path.`,
        `Tasks path: ${resolvedTasksPath}`,
      ];
      if (failures.length > 0) {
        lines.push(
          `${failures.length} invocation(s) failed at the harness level (not the agent getting the answer wrong): ` +
            [...new Set(failures.map((f) => f.error))].join("; ")
        );
      }
      if (unverified.length > 0) {
        lines.push(
          `Warning: unverified agent profile(s) used: ${unverified.join(", ")}. ` +
            `Their CLI flags have not been confirmed against a live install, so failures may be harness bugs.`
        );
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "score_results",
    {
      title: "Score diedinchat raw results",
      description:
        "Keyword-matches each raw result against its task's pre-registered answer key, producing " +
        "PASS/PARTIAL/FAIL per record. Answer keys must be written from the source before a run -- " +
        "adjusting them after seeing output invalidates the result.",
      inputSchema: {
        tasksPath: z.string().optional().describe("Path to the same tasks.json used for the run"),
        example: z.string().optional().describe("Or the bundled example name used for the run"),
        rawDir: z.string().default("./results/raw"),
        outputPath: z.string().default("./results/scored.json"),
      },
    },
    async ({ tasksPath, example, rawDir, outputPath }) => {
      if (!tasksPath && !example) {
        throw new Error("Provide either `tasksPath` or `example`.");
      }
      const tasksDoc = await loadTasksDoc(tasksPath ?? builtinExampleTasksPath(example!));
      const files = (await readdir(rawDir)).filter((f) => f.endsWith(".json")).sort();
      const records: RawRecord[] = [];
      for (const file of files) records.push(JSON.parse(await readFile(join(rawDir, file), "utf-8")));

      const scored = scoreRecords(records, tasksDoc);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, JSON.stringify(scored, null, 2));

      const counts = scored.reduce<Record<string, number>>((acc, r) => {
        const bucket = r.score.split(" ")[0] ?? r.score;
        acc[bucket] = (acc[bucket] ?? 0) + 1;
        return acc;
      }, {});

      return {
        content: [
          {
            type: "text",
            text: `Scored ${scored.length} records -> ${outputPath}\n${JSON.stringify(counts, null, 2)}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "generate_report",
    {
      title: "Generate a diedinchat markdown report",
      description:
        "Aggregates scored results into a markdown report: per-task detail plus pass rate, mean cost, " +
        "and mean latency per agent x policy. The report includes the caveats that bound its own " +
        "interpretation -- keep them attached when sharing the numbers.",
      inputSchema: {
        scoredPath: z.string().default("./results/scored.json"),
        outputPath: z.string().default("./results/report.md"),
      },
    },
    async ({ scoredPath, outputPath }) => {
      const scored = JSON.parse(await readFile(scoredPath, "utf-8"));
      const report = buildReport(scored);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, report);
      return { content: [{ type: "text", text: report }] };
    }
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
