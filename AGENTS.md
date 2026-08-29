# AGENTS.md

If you're an agent working in this repo, read
[`docs/architecture.md`](docs/architecture.md) first -- it covers the
internals, the run/score/report pipeline, and how to add a claim or an agent
profile in one place.

Then [`README.md`](README.md) for what this is and how to run it, and
[`examples/claim-001-tool-count/`](examples/claim-001-tool-count/) for the
specific pilot hypothesis, corpus, and what would falsify it. There is
deliberately no PLANNER.md yet -- writing a phased roadmap before a real,
multi-agent, multi-trial run exists to plan around is exactly the mistake
this repo's sibling project `nocontext` made. Add one only once real results
exist.

## Architecture, in one paragraph

Everything agent-specific lives in one place: an agent *profile*
(`profiles/*.json` or a user-supplied path). Tasks (`tasks.json`) and
policies (`policies/*.json`) are pure data with no agent's flags in them.
`src/agents/profile.ts#buildInvocation` is the single function that turns
(profile, policy name, prompt) into a concrete command line -- if you're
looking for "where does an agent's syntax get resolved," it's there and
nowhere else. Supporting a new agent is writing a profile JSON file, not
new code.

## Before you trust a result

```bash
npm test
```

This exercises the full run → score → report pipeline against a local git
repo and a fake node-based "agent" -- no real coding-agent CLI or network
access needed. If this doesn't pass cleanly, the pipeline is broken
independently of whatever a real run's `results/report.md` says -- fix this
first.

## Fastest ways to break this project silently

- Adjusting `expected_keywords` in a `tasks.json` *after* looking at a real
  run's output. That's circular -- answer keys are written from the source
  docs, frozen, then runs happen.
- Drawing a conclusion from a single trial per condition, or from a single
  agent. Different agents can interpret the same prompt differently
  regardless of tool policy -- `reporter.ts` calls this out explicitly;
  don't strip that caveat out when summarizing a report for someone.
- Reporting a pass rate that folds in `ERROR` rows (harness failures) or
  `UNVERIFIED ANSWER KEY` tasks without checking them by hand first.
- Adding a second claim's tasks into an existing `tasks.json` instead of a
  new `examples/00N-*/` directory with its own `tasks.json` + `policies/`.
  Claims are independent by design.
- Shipping an agent profile with `"verified": true` without having actually
  run it against a live install of that agent's CLI. `profiles/claude-code.json`
  and the templates in `examples/agent-profiles/` show the honest way to
  flag this: `"verified": false"` plus a `"verificationNote"` saying exactly
  what hasn't been checked. `run` prints a warning when it sees this --
  don't silence that warning by flipping the flag instead of doing the
  verification.
- Treating `policyArgs` as portable across agents. "curated" and "full" are
  names for an *intent*; the actual flags behind them are specific to each
  profile and must be defined per agent, never copy-pasted assuming another
  agent's tool-name syntax will parse.


