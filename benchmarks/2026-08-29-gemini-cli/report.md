# diedinchat: report

## Verdict

**gemini-cli**: Not distinguishable. The interval spans zero, so this run provides no evidence that "curated" and "full" differ in task success.

| policy | pass rate | n |
|---|---|---|
| curated | 18/24 (75%) | 24 |
| full | 17/24 (71%) | 24 |

Difference: **+4 points** (95% CI -21 to +28, Agresti-Caffo). The interval includes zero, so the two are not distinguishable at this sample size.

### Caveats that bound this verdict

- 1 answer(s) were under 20 characters (t8-benchmark-comparison/curated), which usually means a truncated or degenerate generation rather than a wrong answer. They are counted as failures above; inspect them before treating them as evidence about the policy.
- Smallest condition has n=24. At this size only large differences are detectable; a "not distinguishable" verdict means underpowered, not equivalent.

## Per-task detail

| task | agent | policy | score | cost (usd) | latency (ms) |
|---|---|---|---|---|---|
| t1-license | gemini-cli | curated | PASS | n/a | 11490 |
| t1-license | gemini-cli | curated | PASS | n/a | 10667 |
| t1-license | gemini-cli | curated | PASS | n/a | 10766 |
| t1-license | gemini-cli | full | PASS | n/a | 10214 |
| t1-license | gemini-cli | full | PASS | n/a | 11164 |
| t1-license | gemini-cli | full | PASS | n/a | 13110 |
| t2-precommit | gemini-cli | curated | PASS | n/a | 16345 |
| t2-precommit | gemini-cli | curated | PASS | n/a | 15824 |
| t2-precommit | gemini-cli | curated | PASS | n/a | 17910 |
| t2-precommit | gemini-cli | full | PASS | n/a | 16183 |
| t2-precommit | gemini-cli | full | PASS | n/a | 17786 |
| t2-precommit | gemini-cli | full | PASS | n/a | 15719 |
| t3-p1-improvement | gemini-cli | curated | PASS | n/a | 24539 |
| t3-p1-improvement | gemini-cli | curated | PASS | n/a | 26771 |
| t3-p1-improvement | gemini-cli | curated | PASS | n/a | 17416 |
| t3-p1-improvement | gemini-cli | full | PASS | n/a | 16317 |
| t3-p1-improvement | gemini-cli | full | PASS | n/a | 17674 |
| t3-p1-improvement | gemini-cli | full | PASS | n/a | 17886 |
| t4-mcp-status | gemini-cli | curated | PARTIAL | n/a | 34461 |
| t4-mcp-status | gemini-cli | curated | PARTIAL | n/a | 26194 |
| t4-mcp-status | gemini-cli | curated | PASS | n/a | 62151 |
| t4-mcp-status | gemini-cli | full | PARTIAL | n/a | 60171 |
| t4-mcp-status | gemini-cli | full | PARTIAL | n/a | 77247 |
| t4-mcp-status | gemini-cli | full | PARTIAL | n/a | 19555 |
| t5-fixture-drift | gemini-cli | curated | PASS | n/a | 19249 |
| t5-fixture-drift | gemini-cli | curated | PASS | n/a | 18324 |
| t5-fixture-drift | gemini-cli | curated | PASS | n/a | 27119 |
| t5-fixture-drift | gemini-cli | full | PASS | n/a | 13128 |
| t5-fixture-drift | gemini-cli | full | PASS | n/a | 16214 |
| t5-fixture-drift | gemini-cli | full | PASS | n/a | 13464 |
| t6-optional-dependency | gemini-cli | curated | PASS | n/a | 20329 |
| t6-optional-dependency | gemini-cli | curated | PARTIAL | n/a | 18095 |
| t6-optional-dependency | gemini-cli | curated | PASS | n/a | 18660 |
| t6-optional-dependency | gemini-cli | full | PARTIAL | n/a | 46906 |
| t6-optional-dependency | gemini-cli | full | PASS | n/a | 18906 |
| t6-optional-dependency | gemini-cli | full | PASS | n/a | 20478 |
| t7-adversarial-example | gemini-cli | curated | PASS | n/a | 14044 |
| t7-adversarial-example | gemini-cli | curated | PASS | n/a | 13862 |
| t7-adversarial-example | gemini-cli | curated | PASS | n/a | 13046 |
| t7-adversarial-example | gemini-cli | full | PASS | n/a | 20206 |
| t7-adversarial-example | gemini-cli | full | PASS | n/a | 11533 |
| t7-adversarial-example | gemini-cli | full | PASS | n/a | 11449 |
| t8-benchmark-comparison | gemini-cli | curated | PARTIAL | n/a | 18381 |
| t8-benchmark-comparison | gemini-cli | curated | FAIL | n/a | 13806 |
| t8-benchmark-comparison | gemini-cli | curated | PARTIAL | n/a | 25560 |
| t8-benchmark-comparison | gemini-cli | full | PARTIAL | n/a | 18728 |
| t8-benchmark-comparison | gemini-cli | full | FAIL | n/a | 14473 |
| t8-benchmark-comparison | gemini-cli | full | PARTIAL | n/a | 17822 |

## Per-condition summary

| agent | policy | n | pass rate | mean cost (usd) | mean latency (ms) |
|---|---|---|---|---|---|
| gemini-cli | curated | 24 | 18/24 (75%) | n/a | 20625 |
| gemini-cli | full | 24 | 17/24 (71%) | n/a | 21514 |

## Read this before drawing any conclusion

- n reflects tasks x trials actually run. A single trial per condition is not enough to separate signal from model-sampling noise -- re-run with multiple trials before treating a result as more than directional.
- Any score prefixed `UNVERIFIED ANSWER KEY` means the expected answer was not independently confirmed against the source at task-authoring time -- verify before counting it as a pass or fail.
- `ERROR` rows are harness failures (CLI crash, non-JSON output, timeout), not the agent failing the task -- excluded from pass rate, mean cost, and mean latency above, not just the pass rate.
- Comparing across agents (not just across policies within one agent) adds a confound: different agents may interpret the same prompt differently regardless of tool policy. Prefer within-agent policy comparisons unless you have enough trials to say otherwise.
