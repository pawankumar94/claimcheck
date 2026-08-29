#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadTasksDoc } from "./core/tasks.js";
import { runEvaluation } from "./core/runner.js";
import { scoreRecords } from "./core/scorer.js";
import { buildReport } from "./core/reporter.js";
import { startMcpServer } from "./mcp-server.js";
import { builtinExampleTasksPath, describeBuiltinProfiles, listBuiltinExamples, resolveAgentProfile } from "./core/resolve.js";
import { TARGETS, detectTargets, findTarget, installTarget, loadTemplate } from "./core/install.js";
import { buildCharts } from "./core/chart.js";
import { detectAgents, explainNoAgent, pickDefaultAgent } from "./core/detect.js";
import { analyze } from "./core/analysis.js";
import { runEvaluation as runEval } from "./core/runner.js";
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
    "Measure whether a coding-agent config change actually helped. Run with no arguments for a zero-setup measurement."
  )
  .version("0.1.0");

program
  .command("measure", { isDefault: true })
  .description("Measure whether trimming your agent's tool surface changes task success. Needs no files: tasks, answer keys, and agent profiles all ship with claimcheck.")
  .option("--agent <name>", "agent to measure; auto-detected from what is installed if omitted")
  .option("--example <name>", "bundled task set to use", "bfcl-tool-count")
  .option("--trials <n>", "repeats per task per policy", "2")
  .option("--tasks-limit <n>", "how many tasks to run", "10")
  .option("--full", "run the whole task set at 3 trials instead of the quick default")
  .option("--out-dir <path>", "where to write raw results", "./results/raw")
  .option("--yes", "skip the cost confirmation prompt")
  .action(async (opts) => {
    const detected = await detectAgents();
    const { chosen, all } = opts.agent
      ? { chosen: detected.find((a) => a.name === opts.agent) ?? null, all: detected }
      : await pickDefaultAgent();

    if (!chosen) {
      console.error(
        opts.agent
          ? `No built-in profile named "${opts.agent}". Available: ${detected.map((a) => a.name).join(", ")}.`
          : explainNoAgent(all)
      );
      process.exitCode = 1;
      return;
    }

    // An explicitly named agent skips the readiness filter that auto-detection
    // applies, so check it here too. Otherwise every invocation fails on auth
    // and the user pays for the round trip to find that out.
    if (!chosen.installed) {
      console.error(`"${chosen.name}" needs \`${chosen.command}\` on your PATH, and it is not installed.`);
      process.exitCode = 1;
      return;
    }
    if (chosen.missingEnv.length > 0) {
      console.warn(
        `Warning: ${chosen.name} usually needs ${chosen.missingEnv.join(", ")}, which ${chosen.missingEnv.length === 1 ? "is" : "are"} unset.\n` +
          `If it is authenticated another way this is fine. If not, every invocation will fail.\n`
      );
    }

    const tasksPath = builtinExampleTasksPath(opts.example);
    const tasksDoc = await loadTasksDoc(tasksPath);
    if (!opts.full) tasksDoc.tasks = tasksDoc.tasks.slice(0, Number(opts.tasksLimit));

    // Policies come from the task set itself, so the user never names them.
    const policies = Object.keys(tasksDoc.tasks[0]?.prompt_by_policy ?? {});
    if (policies.length !== 2) {
      console.error(
        `Task set "${opts.example}" defines ${policies.length} prompt-level policies, so there is no ` +
          `two-way comparison to run automatically. Use \`claimcheck run\` and name the policies yourself.`
      );
      process.exitCode = 1;
      return;
    }

    const profile = await resolveAgentProfile(chosen.name);
    const trials = opts.full ? 3 : Number(opts.trials);
    const invocations = tasksDoc.tasks.length * 2 * trials;
    console.log(`Measuring ${chosen.name} on "${opts.example}": ${policies.join(" vs ")}`);
    console.log(`${tasksDoc.tasks.length} tasks x 2 policies x ${trials} trials = ${invocations} invocations against your own account.`);
    console.log(`Roughly ${Math.ceil((invocations * 12) / 60)} min. This spends real API budget on ${chosen.command}.`);
    if (!opts.full) console.log(`This is the quick default. Use --full for the whole task set at 3 trials.`);
    console.log();

    if (!opts.yes && process.stdin.isTTY) {
      const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question("Run it? [y/N] ")).trim().toLowerCase();
      rl.close();
      if (answer !== "y" && answer !== "yes") {
        console.log("Nothing run.");
        return;
      }
      console.log();
    } else if (!opts.yes) {
      // Non-interactive and unconfirmed: refuse rather than silently spend.
      console.error("Refusing to spend budget without confirmation. Re-run with --yes (no TTY to prompt on).");
      process.exitCode = 1;
      return;
    }

    const records = await runEval({
      tasksDoc, agents: [profile], policyNames: policies, outDir: opts.outDir, trials,
      onRecord: (r) => process.stdout.write(r.ok ? "." : "x"),
    });
    process.stdout.write("\n\n");

    const scored = scoreRecords(records, tasksDoc);
    const { comparisons, warnings } = analyze(scored, { candidatePolicy: policies[0]!, baselinePolicy: policies[1]! });
    const failures = records.filter((r) => !r.ok).length;
    if (failures > 0) console.log(`${failures} invocation(s) failed at the harness level and are excluded.\n`);

    for (const c of comparisons) {
      console.log(`  ${c.candidate.policy.padEnd(14)} ${c.candidate.passes}/${c.candidate.n} (${c.candidate.passRate.toFixed(0)}%)`);
      console.log(`  ${c.baseline.policy.padEnd(14)} ${c.baseline.passes}/${c.baseline.n} (${c.baseline.passRate.toFixed(0)}%)\n`);
      console.log(`  ${c.deltaPoints >= 0 ? "+" : ""}${c.deltaPoints.toFixed(0)} points, 95% CI ${c.ci95[0].toFixed(0)} to ${c.ci95[1].toFixed(0)}`);
      console.log(`  ${c.verdict}\n`);
    }
    for (const w of warnings) console.log(`  note: ${w}`);

    const cost = records.reduce((a, r) => a + (r.metrics?.cost ?? 0), 0);
    if (cost > 0) console.log(`\n  spent: $${cost.toFixed(2)}`);
    console.log(`\n  Charts: claimcheck chart --input <scored.json>   Full report: claimcheck report`);
  });

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
