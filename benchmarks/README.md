# Benchmarks

Every run diedinchat has produced, with the caveats that bound it. Numbers are
curated here by hand; raw run output stays untracked.

## Results so far

| Run | Agent | Variable tested | Result | Distinguishable? |
|---|---|---|---|---|
| [2026-08-29-gemini-cli](2026-08-29-gemini-cli/) | Gemini CLI 0.10.0 | Tool count (`--allowed-tools` vs unrestricted) | 75% vs 71%, **+4 pts** (CI −21 to +28) | No |
| [2026-08-29-codex-in-agent](2026-08-29-codex-in-agent/) | Codex CLI 0.147.0 | Tool count (29 MCP servers vs diedinchat only) | 75% vs 75%, **0 pts** (CI −40 to +40) | No |
| [2026-08-29-codex-sandbox](2026-08-29-codex-sandbox/) | Codex CLI 0.147.0 | Sandbox permission, **not** tool count | 88% vs 88%, **0 pts** (CI −20 to +20) | No |

## What three runs actually show

**No run has detected an effect from reducing the tool surface.** Two
independent agents, two different mechanisms for restricting tools, and a
negative control all came back indistinguishable from zero.

That is *not* "the claim is false." Every run here is underpowered. At 8 to 24
observations per arm, only large effects are detectable. Published work using much
wider contrasts does find an effect: ["How Many Tools Should an LLM Agent
See?"](https://arxiv.org/html/2605.24660v1) reports 93.1% vs 87.1% (and 76.8%
vs 60.9% on harder queries) when varying shortlist depth over registries of
370–3,251 tools. Our contrasts are tiny by comparison (five read-only tools
versus a slightly larger set), and every task was deliberately answerable
either way.

The honest reading: **these runs were not designed to detect the effect that
literature reports.** Testing it properly needs a far wider contrast and more
observations.

## The finding that did replicate

Two runs reached it independently, which is the strongest signal here:

> **The scorer, not the tool policy, was the dominant source of failure.**

Correct answers were rejected on phrasing. *"does not currently ship an MCP
server"* scored PARTIAL because the key demanded the literal `"not started"`;
*"holds the retriever fixed"* failed against `"fixes the retriever"`. Under
manual review the Codex run scored 8/8 in both arms where automated scoring
gave 6/8.

Both arms are penalised identically, so the comparisons stand, but every
absolute pass rate here understates real accuracy.

Keys were **not** loosened afterwards; that would make the measurement
circular. The fix landed as a mechanism instead: tasks can now declare
`accept` criteria (`any_of` / `all_of` / `regex`) that enumerate acceptable
phrasings *before* a run. A task set using them is a new versioned set with its
own run, not a patch applied to these.

## Reading any run here

- **Underpowered is not equivalent.** "Not distinguishable" means the run
  could not see an effect, not that none exists.
- **Within-agent only.** Different agents interpret prompts differently, so
  gaps between the rows above are not attributable to configuration.
- **Harness failures are excluded** from pass rates and reported separately.
