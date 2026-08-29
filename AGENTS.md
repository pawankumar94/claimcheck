# AGENTS.md

If you're an agent working in this repo, read [`README.md`](README.md) first
— the problem statement and product direction live there. Then
[`docs/architecture.md`](docs/architecture.md) for the lab internals
(run/score/report, agent profiles).

**Product direction (do not reverse this in a drive-by):** diedinchat is
file-bound tickets — assertions pinned to paths in `.diedinchat/`,
visible across sessions and agents, flipping `stale` when those files
change. The existing eval CLI is the *lab* we use to prove that works, not
the product. Phases, what’s shipped, and what to build next:
[`PLANNER.md`](PLANNER.md). Do not lead new copy with BFCL or config A/B.

Then [`examples/claim-001-tool-count/`](examples/claim-001-tool-count/) for
the specific *lab* hypothesis, corpus, and what would falsify it.


## Architecture, in one paragraph

Everything agent-specific lives in one place: an agent *profile*
(`profiles/*.json` or a user-supplied path). Tasks (`tasks.json`) and
policies (`policies/*.json`) are pure data with no agent's flags in them.
`src/agents/profile.ts#buildInvocation` is the single function that turns
(profile, policy name, prompt) into a concrete command line -- if you're
looking for "where does an agent's syntax get resolved," it's there and
nowhere else. Supporting a new agent is writing a profile JSON file, not
new code. Tickets live in repo-local `.diedinchat/`, not in
`~/.diedinchat` (lab runs only) and not per-agent.

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
  run it against a live install of that agent's CLI.
  `profiles/claude-code.json` and the templates in
  `examples/agent-profiles/` show the honest way to flag this:
  `"verified": false` plus a `"verificationNote"` saying exactly what
  hasn't been checked. `run` prints a warning when it sees this -- don't
  silence that warning by flipping the flag instead of doing the
  verification.
- Treating `policyArgs` as portable across agents. "curated" and "full"
  are names for an *intent*; the actual flags behind them are specific to
  each profile and must be defined per agent, never copy-pasted assuming
  another agent's tool-name syntax will parse.
- Rewriting the README problem back into "A/B test your MCP tools" after
  this direction change. The lab stays; it is not the pitch.

<!-- diedinchat:start -->
# diedinchat: measuring agent configuration changes

Use this whenever someone asks whether a change to an agent's setup (tools, MCP servers, context, model, prompt) actually made it better. The answer is a measurement, not an impression.

## The trap this exists to prevent

Agent configuration advice is almost entirely anecdotal: *"I cut our tool count and it felt sharper."* Nobody's numbers are on your tasks or your codebase. Worse, the natural way to check is circular: run the agent, look at the output, then decide what counts as a good answer.

## The method

1. **Write the tasks and answer keys first.** Pick questions with verifiable answers drawn from a fixed source (a pinned commit, a spec, a doc). Write what a correct answer must contain *before* running anything.

2. **Freeze the keys.** Never adjust an answer key after seeing output. That single act converts a measurement into a rubber stamp. If a key turns out to be badly specified, say so, and fix it in a *new* task set that gets its own run. Do not patch it into the current one.

3. **Change exactly one thing.** Run the task set under configuration A, change only the variable under test, run it again under configuration B. Same tasks, same keys, same order.

4. **Run more than once.** Model sampling varies. A single trial per condition cannot separate a real effect from noise. Three trials is a floor, not a target.

5. **Report the uncertainty, not just the delta.** "75% vs 71%" is not a result. "+4 points, 95% CI −21 to +28" is, and it says plainly that the run found nothing. When the interval spans zero, say the conditions are *not distinguishable*, and never describe that as one side winning.

6. **Underpowered is not equivalent.** "No detectable difference" at small n means the run could not see an effect, not that no effect exists. Say which one you mean.

7. **Do not compare across agents.** Two different agents interpret the same prompt differently regardless of configuration, so a gap between them is not attributable to the thing under test. Compare a single agent against itself.

8. **Separate harness failures from wrong answers.** A crash, a timeout, or a truncated generation is not the agent getting the answer wrong. Exclude those from pass rates and report them separately, or a broken setup will read as a bad configuration.

9. **Inspect every non-pass by hand.** Keyword scoring rejects correct answers that used different words. Before reporting, read the failures. If most are phrasing mismatches, the scorer is your limiting factor and the pass rates understate real accuracy. Say so.

## Running it

If the `diedinchat` CLI is available:

```bash
diedinchat profiles                                   # what can be measured
diedinchat run --tasks <tasks.json> --agent <name> \
  --policy curated --policy full --trials 3
diedinchat score --tasks <tasks.json>
diedinchat report                                     # verdict + CI
```

If the diedinchat MCP server is connected, `start_run` / `submit_answers` / `compare_runs` do the same thing with you as the subject: answer the tasks yourself under one configuration, have the user change their real setup, answer again, then compare. Record honestly what configuration was in effect, because the restriction is enforced by the user's actual config, not by diedinchat.

If neither is installed, you can still follow the method above by hand. The discipline is the point; the tooling only removes arithmetic.

## Reporting

Lead with whether the difference was distinguishable. Then the rates, then the interval, then the caveats that bound them. Never present a statistically indistinguishable gap as a win, and never drop the caveats when summarising, because they are what makes the number worth anything.

<!-- diedinchat:end -->
