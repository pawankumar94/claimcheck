# claimcheck

**A/B test your coding agent's configuration instead of guessing.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen.svg)](package.json)

## The problem

Every coding agent has knobs: which tools it can call, how many MCP servers
it connects to, what goes in its context, which model it runs. Change any of
them and you're making a bet about task success.

Nobody can tell you whether those bets pay off. The advice is all anecdotal —
*"I trimmed our MCP tools and it felt sharper"* — and even where someone has
real numbers, they're numbers for their agent, their tasks, their codebase.
Not yours. So teams ship agent configs on vibes and never find out.

claimcheck turns that into a measurement. Define a set of tasks with
known-correct answers, define two or more configurations, and it runs every
task under every configuration against a real agent CLI, then reports pass
rates side by side.

It works with whichever agent you actually use — Claude Code, Gemini CLI,
Codex, Cursor, or your own — because agent-specific invocation details live
in a small JSON profile rather than in the tool itself.

## Quickstart

```bash
git clone https://github.com/pawankumar94/claimcheck.git && cd claimcheck
npm install && npm run build && npm link
claimcheck profiles          # what agents and examples are available
```

Then run the bundled example, which tests the most-repeated config claim in
circulation — *does restricting an agent's tools improve task success?*

```bash
claimcheck run --tasks examples/claim-001-tool-count/tasks.json \
  --agent gemini-cli --policy curated --policy full
claimcheck score --tasks examples/claim-001-tool-count/tasks.json
claimcheck report && cat results/report.md
```

Each task pairs a question with an answer key written from the source before
any run happens, so results can't be graded to taste after the fact. The
report opens with a verdict rather than a grid:

```
## Verdict

gemini-cli — Not distinguishable. The interval spans zero, so this run
provides no evidence that "curated" and "full" differ in task success.

| policy  | pass rate   |
|---------|-------------|
| curated | 18/24 (75%) |
| full    | 17/24 (71%) |

Difference: +4 points (95% CI -21 to +28, Agresti-Caffo).
```

That's a real result from this repo. Across **three runs on two agents**
(Gemini CLI and Codex, 144 invocations total), reducing the tool surface showed
**no detectable effect** — every interval spans zero. All results, charts, and
the caveats that bound them: **[benchmarks/](benchmarks/)**.

Which is a finding about our experiments as much as about the claim: published
work using much wider contrasts *does* find an effect, so these runs were
underpowered by design rather than the claim being false. The write-ups say so.

> Requires the target agent's CLI installed and authenticated. The example
> above needs `gemini` and `GEMINI_API_KEY`; substitute `--agent claude-code`
> for Claude Code. See [Agent support](#agent-support).

## How it works

Three inputs, one pipeline.

| Input | What it is | Agent-specific? |
|---|---|---|
| **Tasks** (`tasks.json`) | Questions about a pinned repo, each with a pre-registered answer key | No |
| **Policies** (`policies/*.json`) | Named configurations under test — e.g. `curated` vs `full` | No |
| **Agent profiles** (`profiles/*.json`) | How to invoke one agent's CLI, and how each policy name maps to its flags | **Yes — only here** |

```
claimcheck run     → fresh repo checkout per invocation, calls the agent CLI, writes raw JSON
claimcheck score   → matches each answer against its pre-registered key
claimcheck report  → aggregates into pass rate, cost, and latency per agent × policy
```

Confining agent syntax to the profile is what makes the rest portable:
supporting a new agent is writing one JSON file, never touching pipeline
code. `buildInvocation()` in [src/agents/profile.ts](src/agents/profile.ts)
is the single place a policy becomes a command line.

## Agent support

| Agent | Profile | Status |
|---|---|---|
| **Gemini CLI** | [`profiles/gemini-cli.json`](profiles/gemini-cli.json) | **Verified end to end.** A real run against the example task set passed under both policies. Reports tokens rather than USD, so `cost` shows `n/a`. |
| **Claude Code** | [`profiles/claude-code.json`](profiles/claude-code.json) | **Partially verified.** Flags and output schema confirmed against a live `claude` 2.1.220 install; task-answering not yet confirmed (verification environment had no API key). |
| Codex CLI | [`examples/agent-profiles/codex.example.json`](examples/agent-profiles/codex.example.json) | Template only — flags unverified against a live install. |
| Cursor CLI | [`examples/agent-profiles/cursor-cli.example.json`](examples/agent-profiles/cursor-cli.example.json) | Template only — flags unverified against a live install. |
| Anything else | — | Write a profile; see below. |

Each profile records its own verification status, and `claimcheck run` warns
when it uses an unverified one, so results carry that caveat instead of
looking more solid than they are.

## Writing an agent profile

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

| Field | Purpose |
|---|---|
| `policyArgs` | Maps each policy name to that agent's actual flags. Tool names and flag syntax aren't standardized across agents, so this translation is per-agent by necessity. |
| `promptPlacement` | `after-base` (default), `end`, or `stdin`, depending on how the CLI accepts a prompt. |
| `output` | `json` parses stdout and reads fields by dot-path; `text` treats stdout as the answer. |
| `verified` | Set `false` with a `verificationNote` until you've run it against a live install and checked the output. |

Working examples: [`profiles/gemini-cli.json`](profiles/gemini-cli.json),
[`profiles/claude-code.json`](profiles/claude-code.json).

## Use it as a plugin

Start here — one command, no server, no config file to edit:

```bash
npx @pawankumar94/claimcheck install
```

It detects which coding agents your project uses and writes the method into the
file each one already reads. Your agent then follows it with nothing running:

| Framework | File written |
|---|---|
| Cursor | `.cursor/rules/claimcheck.mdc` |
| Claude Code | `.claude/skills/claimcheck/SKILL.md` |
| GitHub Copilot | `.github/instructions/claimcheck.instructions.md` |
| Windsurf | `.windsurf/rules/claimcheck.md` |
| Cline | `.clinerules/claimcheck.md` |
| Any agent | `AGENTS.md` (appended in a fenced block) |
| Portable | `skills/claimcheck/SKILL.md` (Agent Skills) |

`--target cursor` picks one, `--all` installs everywhere, `--list` shows the
table above. Re-running is idempotent, and the `AGENTS.md` block is fenced by
markers so it never touches anything else in that file.

That tier costs nothing and needs no runtime, because most of claimcheck's
value is *method* — freeze answer keys before running, repeat trials, report an
interval, never compare across agents. The CLI and MCP server below add
measurement on top; they don't replace it.

### Deeper integration

**Claude Code** — plugin, which bundles the MCP server and slash commands:

```
/plugin marketplace add pawankumar94/claimcheck
/plugin install claimcheck@claimcheck
```

Then `/claimcheck-agents` lists what it can measure and `/claimcheck-run`
runs an evaluation. Or wire up just the MCP server:

```bash
claude mcp add claimcheck -- npx -y @pawankumar94/claimcheck mcp
```

<details>
<summary>Other clients (Cursor, VS Code, Gemini CLI, Codex, …)</summary>

Most clients take the same block, only the file location differs —
`.cursor/mcp.json`, `~/.gemini/settings.json`, and so on:

```json
{
  "mcpServers": {
    "claimcheck": { "command": "npx", "args": ["-y", "@pawankumar94/claimcheck", "mcp"] }
  }
}
```

Full per-client instructions: [docs/integrations.md](docs/integrations.md).

</details>

The MCP server exposes two paths. **In-agent** (`start_run`, `submit_answers`,
`compare_runs`) has the agent you're already talking to answer the tasks
itself — no subprocess, no credentials, no per-agent output parsing, so it
behaves identically in every client. You run once, change your real setup, run
again, and it compares the two with the same frozen keys. **Subprocess**
(`list_agent_profiles`, `run_evaluation`, `score_results`, `generate_report`)
drives an external agent CLI through a profile, for controlled comparisons.

Then you can just ask:

> *Use claimcheck to test whether restricting my agent's tools changes task
> success. Run the bundled example against gemini-cli with 3 trials.*

Since the client and the measured agent can be the same one, this is also how
an agent evaluates its own configuration.

## Development

```bash
npm test        # 34 tests, no network or agent CLI required
npm run build
npm run typecheck
```

The suite covers the full pipeline using a stub agent and a local git repo,
so you can validate changes without spending API budget.

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Internals and extension points |
| [docs/integrations.md](docs/integrations.md) | Per-client plugin setup, library usage |
| [AGENTS.md](AGENTS.md) | Entry point for coding agents working in this repo |

## Scope and limits

Worth being explicit, since the output looks like data:

- **A single trial is not a result.** Model sampling varies. Use `--trials 3`
  or more before treating any difference as real.
- **Scoring is keyword matching, not comprehension.** Deliberately simple and
  auditable, but spot-check `PARTIAL` and `FAIL` rows by hand.
- **Cross-agent comparisons carry a confound.** Different agents interpret
  the same prompt differently regardless of configuration. Within-agent
  policy comparisons are the sound use.
- **Results are scoped to the task set.** Repo-comprehension findings don't
  automatically transfer to code generation or refactoring.

`claimcheck report` prints these caveats alongside every report.

## Adding a claim

Copy [`examples/claim-001-tool-count/`](examples/claim-001-tool-count/):
a new `tasks.json` plus `policies/*.json`, reusing existing agent profiles.
Claims are independent — nothing assumes there's only one.


## License

MIT — see [LICENSE](LICENSE).
