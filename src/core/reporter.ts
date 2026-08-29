import type { ScoredRecord } from "../types.js";
import { analyze } from "./analysis.js";

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}`;
}

/**
 * The part a reader acts on: what the run actually says about the claim,
 * stated before any table, with the uncertainty attached rather than implied.
 */
export interface ReportOptions {
  /** Which policy is the baseline to beat. Defaults to "full". */
  baselinePolicy?: string;
  /** Which policy is the challenger. Defaults to "curated". */
  candidatePolicy?: string;
  /** Lines inserted before the verdict, e.g. what configurations were compared. */
  preamble?: string[];
}

function buildVerdictSection(records: ScoredRecord[], opts: ReportOptions = {}): string[] {
  const { comparisons, warnings } = analyze(records, opts);
  const lines: string[] = ["## Verdict", ""];
  if (opts.preamble && opts.preamble.length > 0) {
    lines.push(...opts.preamble, "");
  }

  if (comparisons.length === 0) {
    lines.push(
      "No within-agent policy comparison was possible -- a comparison needs the same agent run " +
        "under both a narrower and a broader policy.",
      ""
    );
  }

  for (const c of comparisons) {
    lines.push(
      `**${c.agent}** — ${c.verdict}`,
      "",
      `| policy | pass rate | n |`,
      `|---|---|---|`,
      `| ${c.candidate.policy} | ${c.candidate.passes}/${c.candidate.n} (${c.candidate.passRate.toFixed(0)}%) | ${c.candidate.n} |`,
      `| ${c.baseline.policy} | ${c.baseline.passes}/${c.baseline.n} (${c.baseline.passRate.toFixed(0)}%) | ${c.baseline.n} |`,
      "",
      `Difference: **${pct(c.deltaPoints)} points** ` +
        `(95% CI ${pct(c.ci95[0])} to ${pct(c.ci95[1])}, Agresti-Caffo). ` +
        (c.distinguishable
          ? "The interval excludes zero."
          : "The interval includes zero, so the two are not distinguishable at this sample size."),
      ""
    );
  }

  if (warnings.length > 0) {
    lines.push("### Caveats that bound this verdict", "");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  return lines;
}

/**
 * Aggregates scored records into a markdown report, grouped by agent x
 * policy. The honesty caveats are baked into the output itself, not left
 * for a reader to infer.
 */
export function buildReport(records: ScoredRecord[], opts: ReportOptions = {}): string {
  const byCondition = new Map<string, ScoredRecord[]>();
  for (const r of records) {
    const key = `${r.agent_name} / ${r.policy_name}`;
    const list = byCondition.get(key) ?? [];
    list.push(r);
    byCondition.set(key, list);
  }

  const lines: string[] = [
    "# claimcheck: report",
    "",
    ...buildVerdictSection(records, opts),
    "## Per-task detail",
    "",
    "| task | agent | policy | score | cost (usd) | latency (ms) |",
    "|---|---|---|---|---|---|",
  ];

  const sorted = [...records].sort((a, b) => {
    if (a.task_id !== b.task_id) return a.task_id.localeCompare(b.task_id);
    if (a.agent_name !== b.agent_name) return a.agent_name.localeCompare(b.agent_name);
    if (a.policy_name !== b.policy_name) return a.policy_name.localeCompare(b.policy_name);
    return (a.trial ?? 0) - (b.trial ?? 0);
  });

  for (const r of sorted) {
    const cost = r.metrics?.cost ?? "n/a";
    lines.push(
      `| ${r.task_id} | ${r.agent_name} | ${r.policy_name} | ${r.score} | ${cost} | ${r.latency_ms ?? "n/a"} |`
    );
  }

  lines.push(
    "",
    "## Per-condition summary",
    "",
    "| agent | policy | n | pass rate | mean cost (usd) | mean latency (ms) |",
    "|---|---|---|---|---|---|"
  );

  for (const key of [...byCondition.keys()].sort()) {
    const [agentName, policyName] = key.split(" / ");
    const recs = byCondition.get(key)!;
    const n = recs.length;
    const okRecs = recs.filter((r) => r.score !== "ERROR");
    const passes = okRecs.filter((r) => r.score.startsWith("PASS")).length;
    const costs = okRecs
      .map((r) => r.metrics?.cost)
      .filter((c): c is number => typeof c === "number");
    const latencies = okRecs
      .map((r) => r.latency_ms)
      .filter((l): l is number => typeof l === "number");
    const errors = n - okRecs.length;

    const passRate = okRecs.length > 0 ? `${passes}/${okRecs.length} (${Math.round((100 * passes) / okRecs.length)}%)` : "n/a";
    const meanCost = costs.length > 0 ? mean(costs).toFixed(4) : "n/a";
    const meanLatency = latencies.length > 0 ? Math.round(mean(latencies)).toString() : "n/a";
    const errNote = errors > 0 ? ` (${errors} error excluded)` : "";

    lines.push(`| ${agentName} | ${policyName} | ${n}${errNote} | ${passRate} | ${meanCost} | ${meanLatency} |`);
  }

  lines.push(
    "",
    "## Read this before drawing any conclusion",
    "",
    "- n reflects tasks x trials actually run. A single trial per condition " +
      "is not enough to separate signal from model-sampling noise -- re-run " +
      "with multiple trials before treating a result as more than directional.",
    "- Any score prefixed `UNVERIFIED ANSWER KEY` means the expected answer " +
      "was not independently confirmed against the source at task-authoring " +
      "time -- verify before counting it as a pass or fail.",
    "- `ERROR` rows are harness failures (CLI crash, non-JSON output, " +
      "timeout), not the agent failing the task -- excluded from pass rate, " +
      "mean cost, and mean latency above, not just the pass rate.",
    "- Comparing across agents (not just across policies within one agent) " +
      "adds a confound: different agents may interpret the same prompt " +
      "differently regardless of tool policy. Prefer within-agent " +
      "policy comparisons unless you have enough trials to say otherwise."
  );

  return lines.join("\n") + "\n";
}
