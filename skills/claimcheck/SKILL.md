---
name: claimcheck
description: Measure whether an agent configuration change actually helped: pre-registered answer keys, repeated trials, and a confidence interval instead of an impression.
---

# claimcheck: measuring agent configuration changes

Use this whenever someone asks whether a change to an agent's setup (tools,
MCP servers, context, model, prompt) actually made it better. The answer is a
measurement, not an impression.

## The trap this exists to prevent

Agent configuration advice is almost entirely anecdotal: *"I cut our tool count
and it felt sharper."* Nobody's numbers are on your tasks or your codebase.
Worse, the natural way to check is circular: run the agent, look at the
output, then decide what counts as a good answer.

## The method

1. **Write the tasks and answer keys first.** Pick questions with verifiable
   answers drawn from a fixed source (a pinned commit, a spec, a doc). Write
   what a correct answer must contain *before* running anything.

2. **Freeze the keys.** Never adjust an answer key after seeing output. That
   single act converts a measurement into a rubber stamp. If a key turns out
   to be badly specified, say so, and fix it in a *new* task set that gets its
   own run. Do not patch it into the current one.

3. **Change exactly one thing.** Run the task set under configuration A, change
   only the variable under test, run it again under configuration B. Same
   tasks, same keys, same order.

4. **Run more than once.** Model sampling varies. A single trial per condition
   cannot separate a real effect from noise. Three trials is a floor, not a
   target.

5. **Report the uncertainty, not just the delta.** "75% vs 71%" is not a
   result. "+4 points, 95% CI −21 to +28" is, and it says plainly that the run
   found nothing. When the interval spans zero, say the conditions are *not
   distinguishable*, and never describe that as one side winning.

6. **Underpowered is not equivalent.** "No detectable difference" at small n
   means the run could not see an effect, not that no effect exists. Say which
   one you mean.

7. **Do not compare across agents.** Two different agents interpret the same
   prompt differently regardless of configuration, so a gap between them is not
   attributable to the thing under test. Compare a single agent against itself.

8. **Separate harness failures from wrong answers.** A crash, a timeout, or a
   truncated generation is not the agent getting the answer wrong. Exclude
   those from pass rates and report them separately, or a broken setup will
   read as a bad configuration.

9. **Inspect every non-pass by hand.** Keyword scoring rejects correct answers
   that used different words. Before reporting, read the failures. If most are
   phrasing mismatches, the scorer is your limiting factor and the pass rates
   understate real accuracy. Say so.

## Running it

If the `claimcheck` CLI is available:

```bash
claimcheck profiles                                   # what can be measured
claimcheck run --tasks <tasks.json> --agent <name> \
  --policy curated --policy full --trials 3
claimcheck score --tasks <tasks.json>
claimcheck report                                     # verdict + CI
```

If the claimcheck MCP server is connected, `start_run` / `submit_answers` /
`compare_runs` do the same thing with you as the subject: answer the tasks
yourself under one configuration, have the user change their real setup, answer
again, then compare. Record honestly what configuration was in effect, because the
restriction is enforced by the user's actual config, not by claimcheck.

If neither is installed, you can still follow the method above by hand. The
discipline is the point; the tooling only removes arithmetic.

## Reporting

Lead with whether the difference was distinguishable. Then the rates, then the
interval, then the caveats that bound them. Never present a statistically
indistinguishable gap as a win, and never drop the caveats when summarising, because
they are what makes the number worth anything.
