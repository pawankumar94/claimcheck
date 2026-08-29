#!/usr/bin/env python3
"""
Aggregates results/scored.json into a markdown table: pass rate, tokens/cost,
latency, per condition -- with the honesty caveat baked into the output
itself, not left for a reader to infer.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent


def load_json(path: Path) -> list:
    with open(path) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=str(ROOT / "results" / "scored.json"))
    ap.add_argument("--output", default=str(ROOT / "results" / "report.md"))
    args = ap.parse_args()

    records = load_json(Path(args.input))
    by_config = defaultdict(list)
    for r in records:
        by_config[r["config_name"]].append(r)

    lines = ["# claimcheck: report", "", "## Per-task detail", "",
             "| task | config | score | cost (usd) | latency (ms) |",
             "|---|---|---|---|---|"]

    for r in sorted(records, key=lambda r: (r["task_id"], r["config_name"], r.get("trial", 0))):
        cost = r.get("metrics", {}).get("total_cost_usd", "n/a")
        lines.append(
            f"| {r['task_id']} | {r['config_name']} | {r['score']} | {cost} | {r.get('latency_ms', 'n/a')} |"
        )

    lines += ["", "## Per-condition summary", "",
              "| config | n | pass rate | mean cost (usd) | mean latency (ms) |",
              "|---|---|---|---|---|"]

    for config_name, recs in sorted(by_config.items()):
        n = len(recs)
        ok_recs = [r for r in recs if r["score"] != "ERROR"]
        passes = sum(1 for r in ok_recs if r["score"].startswith("PASS"))
        costs = [r["metrics"]["total_cost_usd"] for r in ok_recs
                 if r.get("metrics", {}).get("total_cost_usd") is not None]
        latencies = [r["latency_ms"] for r in ok_recs if r.get("latency_ms") is not None]
        errors = n - len(ok_recs)
        pass_rate = f"{passes}/{len(ok_recs)} ({100*passes/len(ok_recs):.0f}%)" if ok_recs else "n/a"
        mean_cost = f"{mean(costs):.4f}" if costs else "n/a"
        mean_latency = f"{mean(latencies):.0f}" if latencies else "n/a"
        err_note = f" ({errors} error excluded)" if errors else ""
        lines.append(f"| {config_name} | {n}{err_note} | {pass_rate} | {mean_cost} | {mean_latency} |")

    lines += [
        "",
        "## Read this before drawing any conclusion",
        "",
        "- n reflects tasks x trials actually run. If `--trials 1` (the default), "
        "this is a single sample per task per condition -- not enough to separate "
        "signal from model-sampling noise. See `claims/001-tool-count-reduction.md`.",
        "- Any score prefixed `UNVERIFIED ANSWER KEY` means the expected answer "
        "was not independently confirmed against the source file at scaffold "
        "time -- verify before counting it as a pass or fail.",
        "- `ERROR` rows are harness failures (CLI crash, non-JSON output, timeout), "
        "not the model failing the task -- excluded from pass rate, mean cost, and "
        "mean latency in the summary table above, not just the pass rate.",
    ]

    Path(args.output).write_text("\n".join(lines) + "\n")
    print(f"Wrote report to {args.output}")


if __name__ == "__main__":
    main()
