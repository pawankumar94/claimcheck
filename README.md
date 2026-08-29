# claimcheck

Tests specific, widely repeated claims about coding-agent behavior (e.g.
"reducing the number of tools an agent can use improves its task success")
against **any CLI-based coding agent** — Claude Code, Codex, Cursor, Aider,
or one you built yourself — instead of another single-agent anecdote.

## What this is not

Not a benchmark suite, not a product endorsing any one agent, not a claim
about *your* setup. One claim, one corpus, a comparison you can run against
whichever agents you actually use. See
[examples/claim-001-tool-count/](examples/claim-001-tool-count/) for the
pilot claim this project started from, including what would falsify it and
the sample-size caveats — this is directional-signal tooling, not a
statistically powered result generator on its own.

New to this repo? [`.claude/skills/claimcheck-flow/SKILL.md`](.claude/skills/claimcheck-flow/SKILL.md)
is a plain-markdown flow guide covering the architecture and how to extend
it -- written to be equally useful whether you're Claude Code (which also
surfaces it as a skill), Codex, Cursor, or a human.

## How it works

claimcheck has three pieces of data and one pipeline:

1. **A tasks doc** (`tasks.json`) — read-only comprehension questions about a
   pinned public repo, each with a pre-registered answer key
   (`expected_keywords`). Agent-neutral: no agent's flags appear here.
2. **Policies** (`policies/*.json`) — named, agent-neutral descriptions of a
   tool-access intent (e.g. "curated": narrow and read-only; "full": broad,
   write-capable). These are just names + descriptions; they carry no flags.
3. **Agent profiles** (`profiles/*.json` or your own file) — the only
   agent-specific part of this whole system. A profile says how to invoke
   one agent's CLI, and how each policy *name* maps to that agent's actual
   flags. This is the entire mechanism that makes claimcheck agent-agnostic:
   supporting a new agent means writing one JSON file, not new code. See
   [Writing an agent profile](#writing-an-agent-profile).

The pipeline: `claimcheck run` clones the pinned repo fresh per invocation
(isolates state between trials/agents), invokes each agent CLI per its
profile, and writes raw JSON results. `claimcheck score` keyword-matches
each result against its answer key. `claimcheck report` aggregates into a
markdown table: pass/fail, cost, latency, per task/agent/policy.

## Install

```bash
npm install
npm run build
```

(Not yet published to npm — run locally via `npm link`, or `node dist/cli.js`
directly, until it is.)

## Running it

```bash
claimcheck run \
  --tasks examples/claim-001-tool-count/tasks.json \
  --agent claude-code \
  --policy curated --policy full \
  --trials 3

claimcheck score --tasks examples/claim-001-tool-count/tasks.json
claimcheck report
cat results/report.md
```

`--agent` accepts either a built-in profile name (looked up in
[profiles/](profiles/)) or a path to your own profile JSON file, and can be
repeated to run multiple agents in one pass. `--policy` can be repeated too,
but every agent profile you pass must implement every policy name you ask
for (`policyArgs.<name>`), or that combination errors out loudly rather than
silently skipping.

This spends real API/usage budget on whichever agent you point it at — cost
and latency scale with tasks × agents × policies × trials.

## Writing an agent profile

A profile is a small JSON file — see [profiles/claude-code.json](profiles/claude-code.json)
for a complete, working example, and [examples/agent-profiles/](examples/agent-profiles/)
for unverified starting templates for Codex and Cursor's CLIs.

```json
{
  "name": "my-agent",
  "command": "my-agent-cli",
  "baseArgs": ["run", "--headless"],
  "promptPlacement": "after-base",
  "policyArgs": {
    "curated": ["--tools", "read,grep"],
    "full": ["--tools", "all"]
  },
  "extraArgs": ["--json"],
  "output": { "type": "json", "resultField": "answer", "costField": "usage.cost_usd" }
}
```

- `policyArgs` is the piece every agent must define for itself — tool names
  and flag syntax are not standardized across coding agents, so this is
  where a policy's *intent* ("curated" = narrow/read-only) becomes that
  agent's actual invocation.
- `promptPlacement` controls where the prompt goes: `"after-base"` (default,
  as an arg right after `baseArgs`), `"end"` (appended after everything
  else), or `"stdin"` (written to the process's stdin instead of passed as
  an arg — for CLIs that read the prompt that way).
- `output.type` is `"json"` (parse stdout, pull fields by dot-path via
  `resultField`/`costField`/`sessionIdField`) or `"text"` (raw stdout is the
  result, no cost/session data).
- Set `"verified": false` with a `"verificationNote"` if you haven't
  confirmed these flags against a live install — claimcheck prints a warning
  at run time when it sees this, so results carry the caveat instead of
  looking more trustworthy than they are. `profiles/claude-code.json` in
  this repo does exactly that.

## Using it as an MCP server

```bash
claimcheck mcp
```

Starts claimcheck over stdio as an MCP server exposing `run_evaluation`,
`score_results`, and `generate_report` tools — so any MCP-capable agent
(Claude Code, Cursor, etc.) can add claimcheck as a plugin and drive an
evaluation itself, including pointing it at its own agent profile to
evaluate itself.

## Verifying the pipeline without spending API credits

Every piece of the pipeline (scoring, reporting, profile→invocation
translation, output parsing, the run orchestration itself) has unit/e2e
tests that use a fake node-based "agent" and a local git repo — no real
coding-agent CLI or network access required:

```bash
npm test
```

## Adding a second claim

Copy [examples/claim-001-tool-count/](examples/claim-001-tool-count/) as a
template: write a new `tasks.json` and `policies/*.json`, reuse whichever
agent profiles you already have. Each claim is independent — nothing here
assumes there's only ever one, and nothing ties a claim to one agent.

## History

This started as a Python, Claude-Code-only pilot harness. That version is
preserved as-is under [legacy-python/](legacy-python/) for reference — it
still documents the original claim, its falsification criteria, and a known
substring-matching false-positive fix worth reading before extending the
scorer further. The TypeScript package here is a full rewrite: same
underlying method, generalized so any CLI-based agent can be the subject,
not just Claude Code.
