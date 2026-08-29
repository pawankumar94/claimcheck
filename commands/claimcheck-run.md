---
description: Run a claimcheck A/B evaluation comparing tool policies on a real agent CLI
argument-hint: "[agent] [example] [--trials N]"
---

Run a claimcheck evaluation and report whether the tool-policy difference is real.

Arguments the user gave: `$ARGUMENTS` (may be empty).

Steps:

1. Call the `list_agent_profiles` MCP tool to see which agent profiles are
   available, which policies each supports, and which example task sets ship
   with the package. Do not guess these names.

2. Decide the run parameters:
   - **agent**: from `$ARGUMENTS` if given, otherwise pick a profile whose
     `verified` field is true and tell the user which you picked and why.
   - **example**: from `$ARGUMENTS` if given, otherwise the only bundled
     example.
   - **trials**: from `$ARGUMENTS` if given, otherwise 3. Never default to 1 —
     a single trial cannot separate signal from model sampling noise.

3. Before running, tell the user the cost shape in one line: how many
   invocations this is (tasks x policies x trials), that it spawns real agent
   CLI processes against their own credentials, and roughly how long it takes.
   Wait for confirmation unless they clearly already asked you to just run it.

4. Call `run_evaluation` with those parameters. It is slow — do not poll or
   re-invoke it.

5. Call `score_results`, then `generate_report`.

6. Present the report's **Verdict** section first, in your own words. Lead with
   whether the difference was distinguishable, not with the pass rates. If the
   confidence interval spans zero, say plainly that the run found no detectable
   difference — do not describe a statistically indistinguishable gap as though
   one policy won. Then surface any caveats the report lists.
