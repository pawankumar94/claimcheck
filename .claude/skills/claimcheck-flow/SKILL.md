---
name: claimcheck-flow
description: Explains claimcheck's architecture and run/score/report flow -- what tasks, policies, and agent profiles are, how they combine, and how to extend any of them. Use when asked to run an evaluation, add a new claim, write or debug an agent profile, or otherwise work on this repo.
---

# claimcheck flow

This file is a plain markdown doc first, a Claude Code skill second -- read
it the same way regardless of which agent opened it.

## What this repo is

A tool for testing specific claims about coding-agent behavior (e.g.
"fewer tools improves task success") against real CLI-based coding agents,
by running the same read-only comprehension tasks under different tool
policies and scoring the answers against a pre-registered keyword key.

## The three pieces of data, and where they live

1. **Tasks** (`tasks.json`, e.g. [`examples/claim-001-tool-count/tasks.json`](../../examples/claim-001-tool-count/tasks.json))
   -- a pinned repo (`repo_url` + `pinned_sha`) and a list of prompts, each
   with `expected_keywords` (the pre-registered answer key) and a `verified`
   flag (whether that answer key has actually been checked against the
   source, not just inferred). Agent-neutral: no CLI flags appear here.
2. **Policies** (`policies/*.json`, e.g. [`examples/claim-001-tool-count/policies/`](../../examples/claim-001-tool-count/policies/))
   -- just a `name` + human-readable `description` of a tool-access *intent*
   (e.g. "curated" = narrow/read-only, "full" = broad/write-capable). No
   flags here either.
3. **Agent profiles** (`profiles/*.json` for built-ins, or any path you
   choose for a custom one) -- the only place agent-specific syntax lives.
   A profile says how to invoke one agent's CLI, and maps each policy
   *name* to that agent's actual flags via `policyArgs`. See
   [`profiles/claude-code.json`](../../profiles/claude-code.json) for a
   complete, verified example, and [`examples/agent-profiles/`](../../examples/agent-profiles/)
   for unverified templates (Codex, Cursor).

Supporting a new agent means writing one profile JSON file. It never means
touching the run/score/report code.

## The pipeline

```
claimcheck run    --tasks <tasks.json> --agent <name-or-path> [--agent ...] --policy <name> [--policy ...] [--trials N]
claimcheck score  --tasks <tasks.json> [--raw-dir ./results/raw]
claimcheck report [--input ./results/scored.json]
```

- `run` clones the pinned repo fresh per (agent, policy, task, trial)
  combination -- isolates state so one trial's edits (under a write-capable
  policy) can never leak into another -- invokes the agent CLI per its
  profile, and writes one raw JSON record per combination.
- `score` keyword-matches each raw record's answer text against its task's
  `expected_keywords` (short alphanumeric keywords match on word
  boundaries; longer/punctuated ones fall back to substring -- see
  [`src/core/scorer.ts`](../../src/core/scorer.ts)).
- `report` aggregates scored records into a markdown table with pass rate,
  cost, and latency per agent/policy, plus a caveats section that's part of
  the output, not left for a reader to infer.

It's also available as an MCP server (`claimcheck mcp`, stdio transport)
exposing `run_evaluation` / `score_results` / `generate_report` as tools --
see [`src/mcp-server.ts`](../../src/mcp-server.ts) -- so an MCP-capable
agent can drive this whole flow itself instead of shelling out to the CLI.

## Key code, if you need to change behavior

- `src/agents/profile.ts#buildInvocation` -- the one function that turns
  (profile, policy name, prompt) into a concrete command line. If you're
  looking for "where does an agent's syntax get resolved," it's here and
  nowhere else.
- `src/agents/invoke.ts#invokeAgent` -- spawns the process, enforces the
  timeout, and parses stdout per the profile's `output` spec. Handles the
  case where an agent exits non-zero but still emits a useful JSON payload
  on stdout (Claude Code does this on an auth failure) by preferring that
  detail over a bare exit code.
- `src/core/runner.ts#runEvaluation` -- the task x agent x policy x trial
  loop and fresh-checkout isolation.
- `src/core/scorer.ts` / `src/core/reporter.ts` -- scoring and report
  generation, both pure functions over data (no process spawning), easy to
  unit test.

## Adding a new agent

1. Write a profile JSON (see [README.md#writing-an-agent-profile](../../README.md#writing-an-agent-profile)
   for the schema).
2. Set `"verified": false` with a `"verificationNote"` describing exactly
   what you haven't confirmed yet. `run` prints a warning at invocation
   time when it sees this -- don't flip it to `true` until you've actually
   run it against a live install and checked the output shape.
3. Test it against a task without spending real API budget by pointing
   `output.type` at `"text"` and running a trivial local command first, or
   by adapting the fake-agent pattern in [`test/invoke.test.ts`](../../test/invoke.test.ts)
   (a real subprocess, but driven through `node -e`, so no external CLI or
   network is required).

## Adding a new claim

Copy an existing `examples/claim-NNN-*/` directory: new `tasks.json` +
`policies/*.json`, reuse whatever agent profiles already exist. Each claim
is independent -- never fold a second claim's tasks into an existing
`tasks.json`.

## Before trusting any result

Run `npm test` first -- it exercises the full run/score/report pipeline
against a local git repo and a fake node-based agent, no network or
credentials needed. If that doesn't pass cleanly, a real run's numbers
aren't trustworthy either, regardless of what they say. See
[`AGENTS.md`](../../AGENTS.md) for the full list of ways this project can be
broken silently (circular answer keys, single-trial conclusions, folding
`ERROR`/`UNVERIFIED ANSWER KEY` rows into a pass rate, cross-agent
comparisons without acknowledging the confound).
