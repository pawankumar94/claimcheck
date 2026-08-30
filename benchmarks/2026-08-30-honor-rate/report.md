# diedinchat: report

## Verdict

**codex-honor-rate**: "with-tickets" outperformed "no-tickets" by 44 points on this task set.

| policy | pass rate | n |
|---|---|---|
| with-tickets | 9/9 (100%) | 9 |
| no-tickets | 5/9 (56%) | 9 |

Difference: **+44 points** (95% CI +2 to +70, Agresti-Caffo). The interval excludes zero.

### Caveats that bound this verdict

- Smallest condition has n=9. At this size only large differences are detectable; a "not distinguishable" verdict means underpowered, not equivalent.

## Per-task detail

| task | agent | policy | score | cost (usd) | latency (ms) |
|---|---|---|---|---|---|
| auth-in-routes | codex-honor-rate | no-tickets | FAIL | n/a | 36917 |
| auth-in-routes | codex-honor-rate | no-tickets | PASS | n/a | 49200 |
| auth-in-routes | codex-honor-rate | no-tickets | PASS | n/a | 44304 |
| auth-in-routes | codex-honor-rate | with-tickets | PASS | n/a | 35743 |
| auth-in-routes | codex-honor-rate | with-tickets | PASS | n/a | 44881 |
| auth-in-routes | codex-honor-rate | with-tickets | PASS | n/a | 58679 |
| generated-config | codex-honor-rate | no-tickets | FAIL | n/a | 41191 |
| generated-config | codex-honor-rate | no-tickets | FAIL | n/a | 44543 |
| generated-config | codex-honor-rate | no-tickets | FAIL | n/a | 37281 |
| generated-config | codex-honor-rate | with-tickets | PASS | n/a | 50173 |
| generated-config | codex-honor-rate | with-tickets | PASS | n/a | 42691 |
| generated-config | codex-honor-rate | with-tickets | PASS | n/a | 49643 |
| sql-in-handler | codex-honor-rate | no-tickets | PASS | n/a | 43379 |
| sql-in-handler | codex-honor-rate | no-tickets | PASS | n/a | 38810 |
| sql-in-handler | codex-honor-rate | no-tickets | PASS | n/a | 38843 |
| sql-in-handler | codex-honor-rate | with-tickets | PASS | n/a | 44107 |
| sql-in-handler | codex-honor-rate | with-tickets | PASS | n/a | 47656 |
| sql-in-handler | codex-honor-rate | with-tickets | PASS | n/a | 33152 |

## Per-condition summary

| agent | policy | n | pass rate | mean cost (usd) | mean latency (ms) |
|---|---|---|---|---|---|
| codex-honor-rate | no-tickets | 9 | 5/9 (56%) | n/a | 41608 |
| codex-honor-rate | with-tickets | 9 | 9/9 (100%) | n/a | 45192 |

## Read this before drawing any conclusion

- n reflects tasks x trials actually run. A single trial per condition is not enough to separate signal from model-sampling noise -- re-run with multiple trials before treating a result as more than directional.
- Any score prefixed `UNVERIFIED ANSWER KEY` means the expected answer was not independently confirmed against the source at task-authoring time -- verify before counting it as a pass or fail.
- `ERROR` rows are harness failures (CLI crash, non-JSON output, timeout), not the agent failing the task -- excluded from pass rate, mean cost, and mean latency above, not just the pass rate.
- Comparing across agents (not just across policies within one agent) adds a confound: different agents may interpret the same prompt differently regardless of tool policy. Prefer within-agent policy comparisons unless you have enough trials to say otherwise.
