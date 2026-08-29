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
  resolveAgentProfile,
} from "./core/resolve.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import type { RawRecord } from "./types.js";

const VERSION = "0.1.0";

/**
 * Exposes claimcheck's pipeline as MCP tools so any MCP-capable coding agent
 * (Claude Code, Cursor, Codex, Windsurf, Zed, ...) can install it as a plugin
 * and run an evaluation itself -- including pointing it at its own agent
 * profile to measure its own configuration.
 *
 * Agents are referred to by built-in name or by path, never by a path the
 * caller has to guess: an agent invoking this over stdio has no idea where
 * npm installed the package, so `list_agent_profiles` exists for discovery.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "claimcheck", version: VERSION });

  server.registerTool(
    "list_agent_profiles",
    {
      title: "List available agent profiles and example task sets",
      description:
        "Discovery entry point -- call this first. Lists the agent profiles bundled with claimcheck " +
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
    "run_evaluation",
    {
      title: "Run a claimcheck evaluation",
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
      title: "Score claimcheck raw results",
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
      title: "Generate a claimcheck markdown report",
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
