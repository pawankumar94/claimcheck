#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadTasksDoc } from "./core/tasks.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import { startMcpServer } from "./mcp-server.js";
import { describeBuiltinProfiles, listBuiltinExamples, resolveAgentProfile } from "./core/resolve.js";
import { TARGETS, detectTargets, findTarget, installTarget, loadTemplate } from "./core/install.js";
import { buildCharts } from "./core/chart.js";
import { importBfclFromFiles } from "./core/import-bfcl.js";
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
  .option("--baseline <policy>", "policy to treat as the baseline to beat")
  .option("--candidate <policy>", "policy to compare against the baseline")
  .action(async (opts) => {
    const scored = JSON.parse(await readFile(opts.input, "utf-8"));
    const report = buildReport(scored, {
      ...(opts.baseline ? { baselinePolicy: opts.baseline } : {}),
      ...(opts.candidate ? { candidatePolicy: opts.candidate } : {}),
    });
    await writeFile(opts.output, report);
    console.log(`Wrote report to ${opts.output}`);
  });

program
  .command("import-bfcl")
  .description("Build a tool-count task set from Berkeley Function Calling Leaderboard data. Holds each question and its correct answer fixed while varying only how many irrelevant functions are shown.")
  .requiredOption("--entries <path>", "BFCL data file, e.g. BFCL_v4_multiple.json")
  .requiredOption("--ground-truth <path>", "matching file from BFCL's possible_answer/ directory")
  .option("--few <n>", "distractor functions in the narrow arm", "0")
  .option("--many <n>", "distractor functions in the wide arm", "40")
  .option("--limit <n>", "cap the number of imported tasks")
  .option("--seed <n>", "seed for distractor sampling, so imports reproduce", "1")
  .option("--output <path>", "where to write the task set", "./tasks-bfcl.json")
  .action(async (opts) => {
    const doc = await importBfclFromFiles(opts.entries, opts.groundTruth, {
      fewDistractors: Number(opts.few),
      manyDistractors: Number(opts.many),
      ...(opts.limit ? { limit: Number(opts.limit) } : {}),
      seed: Number(opts.seed),
    });
    await writeFile(opts.output, JSON.stringify(doc, null, 2));
    const policies = Object.keys(doc.tasks[0]?.prompt_by_policy ?? {});
    console.log(`Wrote ${doc.tasks.length} tasks to ${opts.output}`);
    console.log(`Policies: ${policies.join(", ")}  (${opts.few} vs ${opts.many} distractor functions)`);
    console.log(`Source: ${doc.source?.name}`);
  });

program
  .command("chart")
  .description("Render SVG charts from scored results: pass rate per policy, the confidence interval against zero, and per-task detail.")
  .option("--input <path>", "path to scored.json", "./results/scored.json")
  .option("--out-dir <path>", "directory to write SVG files into", "./results")
  .option("--baseline <policy>", "policy to treat as the baseline to beat")
  .option("--candidate <policy>", "policy to compare against the baseline")
  .action(async (opts) => {
    const scored = JSON.parse(await readFile(opts.input, "utf-8"));
    const charts = buildCharts(scored, {
      ...(opts.baseline ? { baselinePolicy: opts.baseline } : {}),
      ...(opts.candidate ? { candidatePolicy: opts.candidate } : {}),
    });
    if (charts.length === 0) {
      console.log("No comparison to chart -- charts need one agent run under two policies.");
      return;
    }
    await mkdir(opts.outDir, { recursive: true });
    for (const [i, c] of charts.entries()) {
      const suffix = charts.length > 1 ? `-${i + 1}` : "";
      const a = join(opts.outDir, `pass-rate${suffix}.svg`);
      const b = join(opts.outDir, `per-task${suffix}.svg`);
      await writeFile(a, c.passRate);
      await writeFile(b, c.perTask);
      console.log(`Wrote ${a}\nWrote ${b}`);
    }
  });

program
  .command("mcp")
  .description("Start claimcheck as an MCP server (stdio) so any MCP-capable agent can call it as a tool.")
  .action(async () => {
    await startMcpServer();
  });

program.parseAsync(process.argv);
