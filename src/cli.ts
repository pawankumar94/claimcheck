#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTasksDoc } from "./core/tasks.js";
import { loadAgentProfile } from "./agents/profile.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import { startMcpServer } from "./mcp-server.js";
import type { AgentProfile, RawRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** An --agent value is either a path to a profile JSON file, or the name of a built-in profile shipped in profiles/. */
async function resolveAgentProfile(nameOrPath: string): Promise<AgentProfile> {
  if (existsSync(nameOrPath)) return loadAgentProfile(nameOrPath);
  const builtin = join(PACKAGE_ROOT, "profiles", `${nameOrPath}.json`);
  if (existsSync(builtin)) return loadAgentProfile(builtin);
  throw new Error(
    `no agent profile found for "${nameOrPath}" -- not a file path, and no built-in profile at ${builtin}. ` +
      `Built-in profiles ship in profiles/; custom ones can be any path to a profile JSON file.`
  );
}

async function loadRawRecords(dir: string): Promise<RawRecord[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const records: RawRecord[] = [];
  for (const file of files) {
    records.push(JSON.parse(await readFile(join(dir, file), "utf-8")));
  }
  return records;
}

const program = new Command();
program
  .name("claimcheck")
  .description(
    "Test claims about coding-agent behavior against any CLI-based coding agent, via a small agent-profile config."
  );

program
  .command("run")
  .description("Run tasks against one or more agent profiles under one or more policies.")
  .requiredOption("--tasks <path>", "path to a tasks.json doc")
  .requiredOption("--agent <nameOrPath>", "agent profile: built-in name (e.g. claude-code) or a path to a profile JSON file", collect, [])
  .requiredOption("--policy <name>", "policy name to run (must exist in every agent profile's policyArgs)", collect, [])
  .option("--out-dir <path>", "directory to write raw result JSON into", "./results/raw")
  .option("--trials <n>", "repeats per task per agent per policy", "1")
  .action(async (opts) => {
    const tasksDoc = await loadTasksDoc(opts.tasks);
    const agents = await Promise.all((opts.agent as string[]).map(resolveAgentProfile));

    for (const agent of agents) {
      const unverified = agent.verified === false;
      if (unverified) {
        console.warn(
          `[warn] agent "${agent.name}" is marked unverified${agent.verificationNote ? `: ${agent.verificationNote}` : ""}`
        );
      }
    }

    const records = await runEvaluation({
      tasksDoc,
      agents,
      policyNames: opts.policy,
      outDir: opts.outDir,
      trials: Number(opts.trials),
      onRecord: (r) => {
        const status = r.ok ? "ok" : `FAILED: ${r.error}`;
        console.log(`[${r.agent_name}/${r.policy_name}] ${r.task_id} trial=${r.trial} -> ${status}`);
      },
    });
    console.log(`\nWrote ${records.length} raw records to ${opts.outDir}`);
  });

program
  .command("score")
  .description("Keyword-score raw results against a tasks doc's answer keys.")
  .requiredOption("--tasks <path>", "path to a tasks.json doc")
  .option("--raw-dir <path>", "directory of raw result JSON files", "./results/raw")
  .option("--input <path>", "single JSON file containing an array of raw records (overrides --raw-dir)")
  .option("--output <path>", "path to write scored.json to", "./results/scored.json")
  .action(async (opts) => {
    const tasksDoc = await loadTasksDoc(opts.tasks);
    const records: RawRecord[] = opts.input
      ? JSON.parse(await readFile(opts.input, "utf-8"))
      : await loadRawRecords(opts.rawDir);

    const scored = scoreRecords(records, tasksDoc);
    await writeFile(opts.output, JSON.stringify(scored, null, 2));
    console.log(`Wrote ${scored.length} scored records to ${opts.output}`);

    const fails = scored.filter((r) => r.score.startsWith("FAIL") || r.score === "ERROR");
    if (fails.length > 0) {
      console.log(`\n${fails.length} FAIL/ERROR -- inspect these by hand before trusting the report:`);
      for (const r of fails) {
        console.log(`  ${r.task_id} / ${r.agent_name} / ${r.policy_name} / trial ${r.trial} -> ${r.score}`);
      }
    }
  });

program
  .command("report")
  .description("Aggregate scored.json into a markdown report.")
  .option("--input <path>", "path to scored.json", "./results/scored.json")
  .option("--output <path>", "path to write report.md to", "./results/report.md")
  .action(async (opts) => {
    const scored = JSON.parse(await readFile(opts.input, "utf-8"));
    const report = buildReport(scored);
    await writeFile(opts.output, report);
    console.log(`Wrote report to ${opts.output}`);
  });

program
  .command("mcp")
  .description("Start claimcheck as an MCP server (stdio) so any MCP-capable agent can call it as a tool.")
  .action(async () => {
    await startMcpServer();
  });

program.parseAsync(process.argv);
