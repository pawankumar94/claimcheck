# claimcheck: report

## Verdict

**codex** — Not distinguishable. The interval spans zero, so this run provides no evidence that "curated" and "full" differ in task success.

| policy | pass rate | n |
|---|---|---|
| curated | 21/24 (88%) | 24 |
| full | 21/24 (88%) | 24 |

Difference: **+0 points** (95% CI -20 to +20, Agresti-Caffo). The interval includes zero, so the two are not distinguishable at this sample size.

### Caveats that bound this verdict

- Smallest condition has n=24. At this size only large differences are detectable; a "not distinguishable" verdict means underpowered, not equivalent.

## Per-task detail

| task | agent | policy | score | cost (usd) | latency (ms) |
|---|---|---|---|---|---|
| t1-license | codex | curated | PASS | n/a | 18783 |
| t1-license | codex | curated | PASS | n/a | 10655 |
| t1-license | codex | curated | PASS | n/a | 9407 |
| t1-license | codex | full | PASS | n/a | 10068 |
| t1-license | codex | full | PASS | n/a | 12447 |
| t1-license | codex | full | PASS | n/a | 9572 |
| t2-precommit | codex | curated | PASS | n/a | 5593 |
| t2-precommit | codex | curated | PASS | n/a | 7543 |
| t2-precommit | codex | curated | PASS | n/a | 4809 |
| t2-precommit | codex | full | PASS | n/a | 6952 |
| t2-precommit | codex | full | PASS | n/a | 4559 |
| t2-precommit | codex | full | PASS | n/a | 4590 |
| t3-p1-improvement | codex | curated | PASS | n/a | 10683 |
| t3-p1-improvement | codex | curated | PASS | n/a | 11953 |
| t3-p1-improvement | codex | curated | PASS | n/a | 11986 |
| t3-p1-improvement | codex | full | PASS | n/a | 11478 |
| t3-p1-improvement | codex | full | PASS | n/a | 14137 |
| t3-p1-improvement | codex | full | PASS | n/a | 12513 |
| t4-mcp-status | codex | curated | PASS | n/a | 22244 |
| t4-mcp-status | codex | curated | PASS | n/a | 36081 |
| t4-mcp-status | codex | curated | PASS | n/a | 29974 |
| t4-mcp-status | codex | full | PASS | n/a | 28742 |
| t4-mcp-status | codex | full | PASS | n/a | 23345 |
| t4-mcp-status | codex | full | PASS | n/a | 28374 |
| t5-fixture-drift | codex | curated | PASS | n/a | 21685 |
| t5-fixture-drift | codex | curated | PASS | n/a | 10943 |
| t5-fixture-drift | codex | curated | PASS | n/a | 17348 |
| t5-fixture-drift | codex | full | PASS | n/a | 9957 |
| t5-fixture-drift | codex | full | PASS | n/a | 12937 |
| t5-fixture-drift | codex | full | PASS | n/a | 9349 |
| t6-optional-dependency | codex | curated | PASS | n/a | 18948 |
| t6-optional-dependency | codex | curated | PASS | n/a | 20826 |
| t6-optional-dependency | codex | curated | PASS | n/a | 19717 |
| t6-optional-dependency | codex | full | PASS | n/a | 16335 |
| t6-optional-dependency | codex | full | PASS | n/a | 30010 |
| t6-optional-dependency | codex | full | PASS | n/a | 21639 |
| t7-adversarial-example | codex | curated | PASS | n/a | 10047 |
| t7-adversarial-example | codex | curated | PASS | n/a | 12271 |
| t7-adversarial-example | codex | curated | PASS | n/a | 14040 |
| t7-adversarial-example | codex | full | PASS | n/a | 22984 |
| t7-adversarial-example | codex | full | PASS | n/a | 14678 |
| t7-adversarial-example | codex | full | PASS | n/a | 11206 |
| t8-benchmark-comparison | codex | curated | PARTIAL | n/a | 12961 |
| t8-benchmark-comparison | codex | curated | PARTIAL | n/a | 13429 |
| t8-benchmark-comparison | codex | curated | PARTIAL | n/a | 11087 |
| t8-benchmark-comparison | codex | full | PARTIAL | n/a | 9816 |
| t8-benchmark-comparison | codex | full | PARTIAL | n/a | 14398 |
| t8-benchmark-comparison | codex | full | PARTIAL | n/a | 12937 |

## Per-condition summary

| agent | policy | n | pass rate | mean cost (usd) | mean latency (ms) |
|---|---|---|---|---|---|
| codex | curated | 24 | 21/24 (88%) | n/a | 15126 |
| codex | full | 24 | 21/24 (88%) | n/a | 14709 |

## Read this before drawing any conclusion

- n reflects tasks x trials actually run. A single trial per condition is not enough to separate signal from model-sampling noise -- re-run with multiple trials before treating a result as more than directional.
- Any score prefixed `UNVERIFIED ANSWER KEY` means the expected answer was not independently confirmed against the source at task-authoring time -- verify before counting it as a pass or fail.
- `ERROR` rows are harness failures (CLI crash, non-JSON output, timeout), not the agent failing the task -- excluded from pass rate, mean cost, and mean latency above, not just the pass rate.
- Comparing across agents (not just across policies within one agent) adds a confound: different agents may interpret the same prompt differently regardless of tool policy. Prefer within-agent policy comparisons unless you have enough trials to say otherwise.
