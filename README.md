<p align="center">
  <img src="brand/social/og-1280x640.png" width="960" alt="ClaimCheck verification ticket beside a coding workspace">
</p>

<h1 align="center">claimcheck</h1>

<p align="center"><strong>Measure whether a coding-agent config change actually helped, instead of guessing.</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-145C60.svg" alt="MIT license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18.17-2DB8A8.svg" alt="Node 18.17 or newer"></a>
</p>

## The problem

Every coding agent has knobs: which tools it can call, how many MCP servers it
connects to, what goes in its context, which model it runs. Change any of them
and you are making a bet about task success.

Nobody can tell you whether those bets pay off. The advice is anecdotal
(*"I trimmed our MCP tools and it felt sharper"*), and even where someone has
real numbers, they are numbers for their agent, their tasks, their codebase.
Not yours. So teams ship agent configs on vibes and never find out.

claimcheck turns that into a measurement. You define tasks with known-correct
answers and two or more configurations. It runs every task under every
configuration against a real agent CLI, then reports whether the difference is
distinguishable from noise.

## What a result looks like

Real output from this repo. Claude Code (Sonnet 5) answering 30 tasks from a
public benchmark, three trials per arm, where the only thing that changed is
how many irrelevant tools were visible:

| policy | tools shown | pass rate |
|---|---|---|
| `few-tools` | 2 | 85/90 (94%) |
| `many-tools` | 42 | 88/90 (98%) |

**Difference: -3 points, 95% CI -9 to +3.** The interval spans zero, so this run
found no evidence that trimming the tool surface helps. More usefully, it rules
things out: if an effect exists here it is smaller than 3 points in the claimed
direction.

That is the point of the tool. Not a leaderboard number, but a bounded answer
to "did this change do anything." Full write-ups, charts, and the caveats that
bound them are in [benchmarks/](benchmarks/).

## Install

One command. No server, no config file to edit:

```bash
npx @pawankumar94/claimcheck install
```

It detects which coding agents your project uses and writes claimcheck's method
into the file each one already reads:

| Agent | File written |
|---|---|
| Claude Code | `.claude/skills/claimcheck/SKILL.md` |
| Cursor | `.cursor/rules/claimcheck.mdc` |
| GitHub Copilot | `.github/instructions/claimcheck.instructions.md` |
| Hermes Agent | `.hermes/skills/claimcheck/SKILL.md` |
| Windsurf | `.windsurf/rules/claimcheck.md` |
| Cline | `.clinerules/claimcheck.md` |
| Any agent | `AGENTS.md`, appended in a fenced block |
| Portable | `skills/…`, `.agents/skills/…` (Agent Skills) |

Use `--target cursor` for one, `--all` for every target, `--list` to see the
table above. Re-running is idempotent, and the `AGENTS.md` block is fenced with
markers so it never touches anything else in that file.

That tier needs no runtime, because most of claimcheck's value is method:
freeze answer keys before running, repeat trials, report an interval, never
compare across agents. The CLI and MCP server below add measurement on top of
it. They do not replace it.

## Run a measurement

```bash
git clone https://github.com/pawankumar94/claimcheck.git && cd claimcheck
npm install && npm run build && npm link

claimcheck profiles
claimcheck run --tasks examples/bfcl-tool-count/tasks.json \
  --agent claude-code-vertex --policy few-tools --policy many-tools --trials 3
claimcheck score --tasks examples/bfcl-tool-count/tasks.json
claimcheck report --baseline many-tools --candidate few-tools
claimcheck chart
```

The bundled example imports its tasks and ground truth from the
[Berkeley Function Calling Leaderboard](https://github.com/ShishirPatil/gorilla),
so the corpus is not self-authored. See
[examples/bfcl-tool-count/](examples/bfcl-tool-count/).

Runs spend real API budget on whichever agent you point them at. The example
above cost $4.26 for 180 invocations.

## How it works

Three inputs, one pipeline:

| Input | What it is | Agent-specific? |
|---|---|---|
| **Tasks** (`tasks.json`) | Questions with pre-registered acceptance criteria | No |
| **Policies** | The configurations under test, such as `few-tools` vs `many-tools` | No |
| **Agent profiles** (`profiles/*.json`) | How to invoke one agent's CLI, and how each policy maps to its flags | Yes, only here |

```
claimcheck run     calls the agent CLI once per task x policy x trial, writes raw JSON
claimcheck score   matches each answer against its pre-registered criteria
claimcheck report  verdict, pass rate, and a 95% interval on the difference
claimcheck chart   SVG charts, including the interval drawn against zero
```

Confining agent syntax to the profile is what keeps the rest portable.
Supporting a new agent means writing one JSON file, never touching pipeline
code. A policy can also live in the prompt rather than in flags, which is how
the tool-count example varies what the model sees without any agent needing a
flag for it.

## Agent support

| Agent | Profile | Status |
|---|---|---|
| **Claude Code** (Vertex AI) | [`claude-code-vertex.json`](profiles/claude-code-vertex.json) | Verified end to end. 180 invocations, cost captured. Model must be pinned; availability is per-deployment. |
| **Gemini CLI** | [`gemini-cli.json`](profiles/gemini-cli.json) | Verified end to end. Reports tokens rather than USD, so `cost` shows `n/a`. |
| **Codex CLI** | [`codex.json`](profiles/codex.json) | Verified end to end. Policy axis is `--ignore-user-config`, so the contrast depends on how many MCP servers you have configured. |
| **Claude Code** (Anthropic API) | [`claude-code.json`](profiles/claude-code.json) | Flags and output schema verified. Task answering unverified, as the check environment had no API key. |
| Cursor CLI | [`examples/agent-profiles/`](examples/agent-profiles/) | Template only, flags unverified. |
| Anything else | | Write a profile, see below. |

Every profile records its own verification status, and `claimcheck run` warns
when it uses an unverified one, so a result carries that caveat instead of
looking more solid than it is.

## Writing an agent profile

```json
{
  "name": "my-agent",
  "command": "my-agent-cli",
  "baseArgs": ["run", "--headless"],
  "promptPlacement": "after-base",
  "policyArgs": {
    "few-tools": ["--tools", "read,grep"],
    "many-tools": ["--tools", "all"]
  },
  "extraArgs": ["--json"],
  "output": { "type": "json", "resultField": "answer", "costField": "usage.cost_usd" }
}
```

| Field | Purpose |
|---|---|
| `policyArgs` | Maps each policy name to that agent's flags. Tool names and flag syntax are not standardized across agents, so this translation is per-agent by necessity. |
| `promptPlacement` | `after-base` (default), `end`, or `stdin`, depending on how the CLI accepts a prompt. |
| `output` | `json` parses stdout and reads fields by dot-path. `text` treats stdout as the answer. |
| `verified` | Keep `false` with a `verificationNote` until you have run it against a live install and checked the output. |

## Use it as an MCP server

```bash
npx -y @pawankumar94/claimcheck mcp
```

Two paths are exposed. **In-agent** (`start_run`, `submit_answers`,
`compare_runs`) has the agent you are already talking to answer the tasks
itself. No subprocess, no credentials, no output parsing, so it behaves the
same in every MCP client. You run once, change your real setup, run again, and
it compares the two against the same frozen criteria. **Subprocess**
(`list_agent_profiles`, `run_evaluation`, `score_results`, `generate_report`)
drives an external agent CLI through a profile.

Per-client setup for Claude Code, Cursor, VS Code, Gemini CLI, and Codex is in
[docs/integrations.md](docs/integrations.md).

## Scope and limits

Worth stating plainly, since the output looks like data:

- **A single trial is not a result.** Model sampling varies. Use at least three
  trials before treating a difference as real.
- **Underpowered is not equivalent.** "Not distinguishable" means the run could
  not see an effect, not that none exists. Sample size determines which is which,
  and the report says so.
- **Scoring is deterministic string matching**, not comprehension. Criteria are
  auditable and frozen before a run, but you should still read the failures.
- **Cross-agent comparisons carry a confound.** Different agents interpret the
  same prompt differently regardless of configuration. Within-agent comparisons
  are the sound use, and the analysis refuses to produce anything else.
- **Results are scoped to the task set.** Function-selection findings do not
  automatically transfer to code generation or refactoring.

`claimcheck report` prints these alongside every report.

## Development

```bash
npm test        # 109 tests, no network or agent CLI required
npm run build
npm run typecheck
```

The suite covers the full pipeline with a stub agent and a local git repo, so
you can validate changes without spending API budget.

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Internals and extension points |
| [docs/integrations.md](docs/integrations.md) | Per-client setup, library usage |
| [AGENTS.md](AGENTS.md) | Entry point for coding agents working in this repo |

## Adding a claim

Copy [examples/bfcl-tool-count/](examples/bfcl-tool-count/) or
[examples/claim-001-tool-count/](examples/claim-001-tool-count/): a new
`tasks.json` plus policies, reusing whatever agent profiles you already have.
Claims are independent, and nothing assumes there is only one.

## License

MIT. See [LICENSE](LICENSE).
