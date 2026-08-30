# File-ticket honor rate: Codex CLI

This is the first direct test of the product claim: does a ticket pinned to
files change what the next coding agent edits?

## Result

Codex honored **9/9 edits (100%) with tickets** and **5/9 (56%) without
tickets**. The difference is **+44 percentage points**, with a 95% Agresti-Caffo
interval of **+2 to +70**. On this small task set, the interval excludes zero.

This supports a narrow claim: on these three fixtures, under Codex CLI 0.147.0,
the presence of `.diedinchat/` tickets changed edit behavior. It does not prove
the result generalizes to other agents, repositories, tasks, or ticket volume.

See [report.md](report.md) for the generated comparison and
[scored.json](scored.json) for every verdict.

## Frozen design

- Agent: authenticated Codex CLI 0.147.0
- Profile: `examples/honor-rate/codex.json`
- Conditions: `with-tickets` and `no-tickets`
- Permissions: `workspace-write` in both conditions
- Tasks: auth in routes, SQL in handlers, generated configuration
- Trials: 3 per task per condition
- Observations: 9 per condition, 18 total
- Harness errors: 0
- Scoring input: captured workspace changes, not final-response prose

The tasks and honor criteria in `examples/honor-rate/tasks.json` were written
before the run and were not changed afterward.

## Manual audit

Every non-pass was inspected:

- `auth-in-routes`, no tickets, trial 0 directly called `requireUser` in the
  new route. This is a genuine violation.
- `generated-config`, all three no-ticket trials edited the generated
  `src/config.ts`. These are genuine violations.
- All nine ticket-present runs made the required edit without the forbidden
  change. Their final messages also explicitly referred to the relevant
  ticket, so these were not accidental passes.

The SQL task passed in both conditions. Existing code already exposed a
`listActiveUsers()` database function, so Codex followed that route even when
no ticket was present. The task remains in the result because removing it after
seeing the run would change the frozen test set.

## Reproduce

```bash
npm run build
node dist/cli.js run \
  --tasks examples/honor-rate/tasks.json \
  --agent examples/honor-rate/codex.json \
  --policy with-tickets \
  --policy no-tickets \
  --trials 3 \
  --out-dir benchmarks/2026-08-30-honor-rate/raw

node dist/cli.js score \
  --tasks examples/honor-rate/tasks.json \
  --raw-dir benchmarks/2026-08-30-honor-rate/raw \
  --output benchmarks/2026-08-30-honor-rate/scored.json

node dist/cli.js report \
  --input benchmarks/2026-08-30-honor-rate/scored.json \
  --candidate with-tickets \
  --baseline no-tickets \
  --output benchmarks/2026-08-30-honor-rate/report.md
```

Raw records are committed because they are the evidence behind this product
claim. They contain isolated temporary paths but no repository credentials.
