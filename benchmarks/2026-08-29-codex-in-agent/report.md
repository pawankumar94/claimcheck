# diedinchat: Codex in-agent report

## Verdict

The two conditions were not distinguishable. Both scored 6/8 automatically
and 8/8 under manual semantic review.

| policy | pass rate | n |
|---|---:|---:|
| codex-minimal | 6/8 (75%) | 8 |
| codex-full | 6/8 (75%) | 8 |

Difference: 0 points. Approximate Agresti-Caffo 95% CI: -40 to +40 points.
The interval includes zero. At this sample size, the run cannot detect anything
except a large difference.

## Per-task scoring

| task | full | minimal | manual review |
|---|---|---|---|
| t1-license | PASS | PASS | correct in both |
| t2-precommit | PASS | PASS | correct in both |
| t3-p1-improvement | PASS | PASS | correct in both |
| t4-mcp-status | PARTIAL | PARTIAL | correct paraphrase in both |
| t5-fixture-drift | PASS | PASS | correct in both |
| t6-optional-dependency | PASS | PASS | correct in both |
| t7-adversarial-example | PASS | PASS | correct in both |
| t8-benchmark-comparison | PARTIAL | PARTIAL | correct paraphrase in both |

## Configuration notes

- `codex-full`: normal user configuration retained, with configured MCP servers
  and enabled plugins, plus diedinchat.
- `codex-minimal`: user configuration ignored, only diedinchat MCP configured.
- Both: Codex CLI 0.147.0, `gpt-5.6-sol`, medium reasoning, read-only sandbox,
  pinned `nocontext` checkout at `6f0d6f48`.

This is one in-agent session per condition. Do not interpret the null result as
equivalence.
