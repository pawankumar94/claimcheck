#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadTasksDoc } from "./core/tasks.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import { startMcpServer } from "./mcp-server.js";
import { describeBuiltinProfiles, listBuiltinExamples, resolveAgentProfile } from "./core/resolve.js";
import { TARGETS, detectTargets, findTarget, installTarget, loadTemplate } from "./core/install.js";
import type { RawRecord } from "./types.js";

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
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
    "A/B test a coding agent's configuration: run the same tasks under different tool policies and compare pass rates."
  )
  .version("0.1.0");

program
  .command("install")
  .description("Install claimcheck's methodology into this project for your coding agent(s). No server, no config edit.")
  .option("--target <id>", "framework to install for (repeatable); omit to auto-detect", collect, [])
  .option("--all", "install for every supported framework")
  .option("--list", "list supported frameworks and where each file goes")
  .option("--dir <path>", "project root to install into", process.cwd())
  .option("--force", "overwrite an existing file even if it differs")
  .action(async (opts) => {
    if (opts.list) {
      console.log("Supported targets:\n");
      for (const t of TARGETS) console.log(`  ${t.id.padEnd(14)} ${t.path.padEnd(48)} ${t.label}`);
      console.log("\nInstall one:   claimcheck install --target cursor");
      console.log("Install all:   claimcheck install --all");
      return;
    }

    const body = await loadTemplate();
    let targets =
      opts.target.length > 0
        ? (opts.target as string[]).map(findTarget)
        : opts.all
          ? TARGETS
          : detectTargets(opts.dir);

    if (targets.length === 0) {
      console.log(
        "No coding-agent framework detected in this project.\n" +
          "Pick one explicitly (claimcheck install --target cursor), see the list\n" +
          "(claimcheck install --list), or install everywhere (--all)."
      );
      return;
    }

    for (const target of targets) {
      const outcome = await installTarget(target, opts.dir, body, { force: opts.force });
      console.log(`  ${outcome.action.padEnd(9)} ${target.path}   (${target.label})`);
    }
    console.log(
      `\nDone. Your agent now follows claimcheck's method with no server running.\n` +
        `For measured runs, add the CLI (claimcheck run --help) or the MCP server (claimcheck mcp).`
    );
  });

program
  .command("profiles")
  .description("List the built-in agent profiles and bundled example task sets.")
  .option("--json", "emit machine-readable JSON instead of a table")
  .action(async (opts) => {
    const [profiles, examples] = await Promise.all([describeBuiltinProfiles(), listBuiltinExamples()]);
    if (opts.json) {
      console.log(JSON.stringify({ agentProfiles: profiles, exampleTaskSets: examples }, null, 2));
      return;
    }
    console.log("Built-in agent profiles:\n");
    for (const p of profiles) {
      console.log(`  ${p.name}${p.verified ? "" : "  (unverified)"}`);
      console.log(`    command:  ${p.command}`);
      console.log(`    policies: ${p.policies.join(", ")}`);
      if (p.description) console.log(`    ${p.description}`);
      console.log();
    }
    console.log("Bundled example task sets:\n");
    for (const e of examples) console.log(`  ${e}`);
    console.log("\nUse a profile name with --agent, e.g.  claimcheck run --agent gemini-cli ...");
  });

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
