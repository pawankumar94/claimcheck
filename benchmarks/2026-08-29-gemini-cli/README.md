# Run: 2026-08-29 — Gemini CLI, claim-001 (tool count)

First real end-to-end result produced by claimcheck.

## Setup

| | |
|---|---|
| Agent | `gemini-cli` (Gemini CLI 0.10.0, model `gemini-3.1-pro-preview`) |
| Task set | `examples/claim-001-tool-count` — 8 repo-comprehension questions |
| Corpus | [`pawankumar94/nocontext`](https://github.com/pawankumar94/nocontext) pinned at `6f0d6f48` |
| Policies | `curated` (read-only tools) vs `full` (unrestricted, write-capable) |
| Trials | 3 per task per policy — 48 invocations total |

Every answer key was verified against the pinned source *before* the run.

## Result

| policy | pass rate |
|---|---|
| curated | 18/24 (75%) |
| full | 17/24 (71%) |

**Difference: +4 points (95% CI −21 to +28).** The interval spans zero, so this
run provides **no evidence** that narrowing the tool surface changes task
success. Full report: [report.md](report.md).

## Reading this honestly

**This is not "the claim is false."** It's a null result on one agent, one task
shape, and 24 observations per arm. At that size only a very large effect would
be detectable, so "not distinguishable" means *underpowered*, not *equivalent*.

**The scorer, not the tool policy, was the dominant source of failure.**
Hand-inspecting every non-PASS row (which the project's rules require) shows
most are correct answers rejected on phrasing:

- `t4-mcp-status` was scored PARTIAL five times out of six for answers like
  *"this repository does not currently ship an MCP server … Phase 5 … gated on
  Phase 4"* — correct in substance, but the key demands the README's literal
  phrase `"not started"`.
- `t8-benchmark-comparison` was scored PARTIAL for *"holds the retriever fixed
  and varies the navigation surface"*, because the key demands the literal
  `"fixes the retriever"`.

Both policies were penalised identically, so the comparison itself isn't
biased — but the absolute pass rates understate real accuracy, and the
between-policy signal is buried under scoring noise.

**One degenerate generation.** `t8` trial 1 returned a single `}` under both
policies. That is a failed generation, not a wrong answer; it is still counted
as a failure above rather than silently dropped.

## What was deliberately not done

The answer keys were **not** loosened after seeing these results. Adjusting keys
to match observed output is the fastest way to turn this project into a
rubber stamp, and it's listed as such in [AGENTS.md](../../AGENTS.md). A
better-specified task set is a *v2 designed before its own run*, not a patch
applied to this one.

## Reproducing

```bash
GEMINI_API_KEY=... claimcheck run \
  --tasks examples/claim-001-tool-count/tasks.json \
  --agent gemini-cli --policy curated --policy full --trials 3
claimcheck score --tasks examples/claim-001-tool-count/tasks.json
claimcheck report
```

Model sampling varies, so exact numbers will differ; the null result should not
unless the effect is much larger than this run could detect.
