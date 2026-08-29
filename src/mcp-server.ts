import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadTasksDoc } from "./core/tasks.js";
import { loadAgentProfile } from "./agents/profile.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import type { RawRecord } from "./types.js";

/**
 * Exposes claimcheck's run/score/report pipeline as MCP tools, so any
 * MCP-capable agent (Claude Code, Cursor, etc.) can install claimcheck as a
 * plugin and drive an evaluation itself -- including, if pointed at its own
 * agent profile, evaluating itself.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "claimcheck", version: "0.1.0" });

  server.registerTool(
    "run_evaluation",
    {
      title: "Run a claimcheck evaluation",
      description:
        "Runs every task in a tasks.json doc against one or more agent profiles under one or more policies, " +
        "and writes raw result JSON to outDir. Agent profiles are either a built-in name (e.g. \"claude-code\") " +
        "or a path to a profile JSON file describing how to invoke that agent's CLI.",
      inputSchema: {
        tasksPath: z.string().describe("Path to a tasks.json doc"),
        agentProfilePaths: z.array(z.string()).min(1).describe("Paths to agent profile JSON files"),
        policyNames: z.array(z.string()).min(1).describe("Policy names to run, e.g. [\"curated\", \"full\"]"),
        outDir: z.string().default("./results/raw"),
        trials: z.number().int().min(1).default(1),
      },
    },
    async ({ tasksPath, agentProfilePaths, policyNames, outDir, trials }) => {
      const tasksDoc = await loadTasksDoc(tasksPath);
      const agents = await Promise.all(agentProfilePaths.map(loadAgentProfile));
      const records = await runEvaluation({ tasksDoc, agents, policyNames, outDir, trials });
      return {
        content: [
          {
            type: "text",
            text: `Ran ${records.length} invocations across ${agents.length} agent(s) x ${policyNames.length} policy(ies). Raw results written to ${outDir}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "score_results",
    {
      title: "Score claimcheck raw results",
      description: "Keyword-scores raw result records against a tasks.json doc's pre-registered answer keys.",
      inputSchema: {
        tasksPath: z.string(),
        rawDir: z.string().default("./results/raw"),
        outputPath: z.string().default("./results/scored.json"),
      },
    },
    async ({ tasksPath, rawDir, outputPath }) => {
      const tasksDoc = await loadTasksDoc(tasksPath);
      const files = (await readdir(rawDir)).filter((f) => f.endsWith(".json")).sort();
      const records: RawRecord[] = [];
      for (const file of files) records.push(JSON.parse(await readFile(join(rawDir, file), "utf-8")));

      const scored = scoreRecords(records, tasksDoc);
      await writeFile(outputPath, JSON.stringify(scored, null, 2));
      const fails = scored.filter((r) => r.score.startsWith("FAIL") || r.score === "ERROR").length;

      return {
        content: [
          {
            type: "text",
            text: `Scored ${scored.length} records (${fails} FAIL/ERROR) -- wrote ${outputPath}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "generate_report",
    {
      title: "Generate a claimcheck markdown report",
      description: "Aggregates a scored.json into a markdown report with per-task detail and per-condition summary.",
      inputSchema: {
        scoredPath: z.string().default("./results/scored.json"),
        outputPath: z.string().default("./results/report.md"),
      },
    },
    async ({ scoredPath, outputPath }) => {
      const scored = JSON.parse(await readFile(scoredPath, "utf-8"));
      const report = buildReport(scored);
      await mkdir(join(outputPath, ".."), { recursive: true });
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
