# Preliminary honor-rate evidence

Does a file-bound ticket change what the next coding agent writes? This is a
mechanism check on small fixtures, not the public developer-value benchmark.

## Result

<p align="center">
  <img src="../assets/honor-rate-summary.svg" width="720" alt="Codex honored 100 percent of edits with tickets and 56 percent without tickets; the 95 percent interval on the 44 point difference excludes zero">
</p>

Codex honored **9/9 edits (100%) with tickets** and **5/9 (56%) without
tickets**. The difference was **+44 percentage points**, with a 95%
Agresti-Caffo interval of **+2 to +70**. The interval excludes zero.

<p align="center">
  <img src="../assets/honor-rate-by-task.svg" width="720" alt="Per-task honor counts for the with-tickets and no-tickets conditions">
</p>

This supports one narrow claim: on these three tasks, with Codex CLI 0.147.0,
the presence of `.diedinchat/` changed edit behavior. It does not establish the
same effect for other agents, repositories, task types, or ticket volume.

## Frozen design

- Agent: authenticated Codex CLI 0.147.0
- Conditions: `with-tickets` and `no-tickets`
- Permissions: identical `workspace-write` sandbox in both conditions
- Tasks: auth in routes, SQL in handlers, generated configuration
- Trials: 3 per task per condition
- Observations: 18 total, 9 per condition
- Harness errors: 0
- Scoring input: captured workspace changes, not the agent's final prose

The complete compact record is
[`honor-rate-results.json`](honor-rate-results.json). It contains the prompt,
condition, trial, latency, agent response, workspace changes, and frozen score
for every invocation. The separate per-invocation copies were removed because
they duplicated this file.

The maintained fixture and scorer live in
[`examples/honor-rate/`](../../examples/honor-rate/). Treat a rerun as a new
evaluation: freeze its task set, keep both conditions identical except for the
tickets, and never overwrite this result after looking at new output.

## Manual audit

Every non-pass was inspected:

- `auth-in-routes`, no tickets, trial 0 called `requireUser` directly in the
  new route. This was a genuine violation.
- `generated-config`, all three no-ticket trials edited generated
  `src/config.ts`. These were genuine violations.
- All nine ticket-present runs made the requested edit without the forbidden
  change. Their final messages explicitly referred to the relevant ticket, so
  they were not accidental passes.

The SQL task passed in both conditions because the existing code already
exposed a database helper. It remains in the result because removing it after
the run would change the frozen test set.

## Boundaries

This is initial product evidence, not a universal benchmark. The next useful
result is the same handoff test on a second agent, ideally with one tool writing
the ticket and a fresh tool consuming it.
