# Example: claim 001, fewer tools improves task success

This is the original pilot claim this project was built around, now expressed
in claimcheck's agent-agnostic format: `tasks.json` and `policies/*.json`
here are pure data, with no agent-specific flags in them. Any agent profile
(built-in `claude-code`, or your own) plugs into this task set unchanged.

Full hypothesis, corpus, and falsification criteria:
[CLAIM.md](CLAIM.md).

## Running it against Claude Code

```bash
claimcheck run \
  --tasks examples/claim-001-tool-count/tasks.json \
  --agent claude-code \
  --policy curated --policy full \
  --trials 3

claimcheck score --tasks examples/claim-001-tool-count/tasks.json
claimcheck report
```

`claude-code` here resolves to the built-in [profiles/claude-code.json](../../profiles/claude-code.json)
profile, which is marked `"verified": false`, check its `verificationNote`
and re-verify its flags against your installed CLI before trusting a real
run's numbers.

## Running it against another agent

Point `--agent` at a profile JSON file instead of a built-in name:

```bash
claimcheck run \
  --tasks examples/claim-001-tool-count/tasks.json \
  --agent claude-code \
  --agent ./my-codex-profile.json \
  --policy curated --policy full \
  --trials 3
```

Both agents run against the same tasks and the same policy *names*, `report.md` will show per-agent, per-policy rows so you can compare within
an agent (curated vs. full) or, with the confound noted in the report,
across agents. See [examples/agent-profiles/](../agent-profiles/) for
unverified starting templates for Codex and Cursor's CLIs, and
[../../README.md#writing-an-agent-profile](../../README.md#writing-an-agent-profile)
for how to write one for an agent not listed there.

## What changed from the original pilot

Nothing about the claim, the corpus, or the answer keys, `tasks.json` is
byte-for-byte the same task set. What changed is *how* a tool policy gets
turned into flags: previously `configs/{curated,full}.json` hardcoded
Claude Code's `--allowedTools` syntax directly; now that translation lives
in each agent's own profile (`policyArgs.curated` / `policyArgs.full`), so
the same "curated" / "full" *intent* can be run against agents whose flags
look nothing like Claude Code's.
