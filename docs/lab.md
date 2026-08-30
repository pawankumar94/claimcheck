<!-- Moved out of README.md: this is the measurement harness, not the product. -->

# The lab

diedinchat ships a controlled-experiment harness alongside the ticket store.
It exists to *test* whether tickets change agent behaviour — it is not what the
tool is for. If you came here to pin constraints, you want
[how-it-works.md](how-it-works.md) instead.

It answers a narrow question: *did this agent-config change actually help, or
is that a vibe?*

```bash
git clone https://github.com/pawankumar94/diedinchat.git && cd diedinchat
npm install && npm run build && npm link
diedinchat
```

It finds whichever agent CLI you already have, runs a public benchmark against
it twice (once with a lean tool surface, once with a cluttered one), and tells
you whether the difference is real or noise.

> On npm: `npx diedinchat`. Clone-and-link above is for hacking on this repo.


### What a result looks like

The lab reports a difference with an interval on it, never a bare rate:

**+4 points, 95% CI -21 to +28.** The interval spans zero, so a run like that
found no evidence either way. That is the point: not a leaderboard number, but
a bounded answer to "did this change do anything."

The claimcheck-era tool-count runs that used to live in `benchmarks/` have been
retired with the old direction. The run that matters for this product is honor
rate `with-tickets` vs `no-tickets`, same tasks, keys frozen first.

The task set, fixture, and honor scorer are in
[examples/honor-rate/](../examples/honor-rate/). Its first result is retained as
a [compact preliminary record](evidence/honor-rate.md). It proves the
harness can detect changed behavior; it does not show the gain developers will
see on real issues.

### Teach your agent the method

```bash
diedinchat install
```

It detects which coding agents your project uses and writes diedinchat's method
into the file each one already reads:

| Agent | File written |
|---|---|
| <img src="../brand/icons/claude.svg" width="16" height="16" valign="middle" /> Claude Code | `.claude/skills/diedinchat/SKILL.md` |
| <img src="../brand/icons/cursor.svg" width="16" height="16" valign="middle" /> Cursor | `.cursor/rules/diedinchat.mdc` |
| <img src="../brand/icons/copilot.svg" width="16" height="16" valign="middle" /> GitHub Copilot | `.github/instructions/diedinchat.instructions.md` |
| <img src="../brand/icons/hermes.png" width="16" height="16" valign="middle" /> Hermes Agent | `.hermes/skills/diedinchat/SKILL.md` |
| <img src="../brand/icons/windsurf.svg" width="16" height="16" valign="middle" /> Windsurf | `.windsurf/rules/diedinchat.md` |
| <img src="../brand/icons/cline.svg" width="16" height="16" valign="middle" /> Cline | `.clinerules/diedinchat.md` |
| <img src="../brand/icons/gemini.svg" width="16" height="16" valign="middle" /> Antigravity / Gemini | `skills/…`, `AGENTS.md` |
| Any agent | `AGENTS.md`, appended in a fenced block |
| Portable | `skills/…`, `.agents/skills/…` (Agent Skills) |

Use `--target cursor` for one, `--all` for every target, `--list` to see the
table above. Re-running is idempotent, and the `AGENTS.md` block is fenced with
markers so it never touches anything else in that file.

### Measuring in more detail

The zero-argument run is deliberately small and cheap: 10 tasks, 2 trials, 40
invocations, a few minutes. It prints what it is about to spend and waits for
you to say yes.

```bash
diedinchat                     # quick look
diedinchat --full              # whole task set, 3 trials
diedinchat --agent codex --yes
```

Its tasks and ground truth come from the
[Berkeley Function Calling Leaderboard](https://github.com/ShishirPatil/gorilla),
so the corpus is not self-authored. See
[examples/bfcl-tool-count/](../examples/bfcl-tool-count/).

Authoring your own tasks is the extension path, not the starting point. When
you want it, the pipeline is four commands and the formats are in
[docs/architecture.md](architecture.md):

```bash
diedinchat run --tasks my-tasks.json --agent codex --policy a --policy b --trials 3
diedinchat score --tasks my-tasks.json
diedinchat report
diedinchat chart
```

### How the lab works

Three inputs, one pipeline:

| Input | What it is | Agent-specific? |
|---|---|---|
| **Tasks** (`tasks.json`) | Questions with pre-registered acceptance criteria | No |
| **Policies** | The configurations under test, such as `few-tools` vs `many-tools` | No |
| **Agent profiles** (`profiles/*.json`) | How to invoke one agent's CLI, and how each policy maps to its flags | Yes, only here |

```
diedinchat run     calls the agent CLI once per task x policy x trial, writes raw JSON
diedinchat score   matches each answer against its pre-registered criteria
diedinchat report  verdict, pass rate, and a 95% interval on the difference
diedinchat chart   SVG charts, including the interval drawn against zero
```

Confining agent syntax to the profile is what keeps the rest portable.
Supporting a new agent means writing one JSON file, never touching pipeline
code.

### Agent support

| Agent | Profile | Status |
|---|---|---|
| <img src="../brand/icons/claude.svg" width="16" height="16" valign="middle" /> **Claude Code** | [`claude-code.json`](../profiles/claude-code.json) | Verified end to end. Invokes CLI in `--bare` mode; flags, output parsing, and cost reporting verified. |
| <img src="../brand/icons/gemini.svg" width="16" height="16" valign="middle" /> **Gemini CLI** | [`gemini-cli.json`](../profiles/gemini-cli.json) | Verified end to end. Reports tokens rather than USD, so `cost` shows `n/a`. |
| <img src="../brand/icons/openai.svg" width="16" height="16" valign="middle" /> **Codex CLI** | [`codex.json`](../profiles/codex.json) | Verified end to end. Policy axis is `--ignore-user-config`, so the contrast depends on how many MCP servers you have configured. |
| <img src="../brand/icons/cursor.svg" width="16" height="16" valign="middle" /> **Cursor CLI** | [`examples/agent-profiles/`](../examples/agent-profiles/) | Template only, flags unverified. |
| Anything else | | Write a profile, see below. |

Every profile records its own verification status, and `diedinchat run` warns
when it uses an unverified one, so a result carries that caveat instead of
looking more solid than it is.

### Writing an agent profile

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

### Use it as an MCP server

```bash
diedinchat mcp
```

Two paths are exposed today. **In-agent** (`start_run`, `submit_answers`,
`compare_runs`) has the agent you are already talking to answer the tasks
itself. **Subprocess** (`list_agent_profiles`, `run_evaluation`,
`score_results`, `generate_report`) drives an external agent CLI through a
profile. Ticket verbs (`pin_claim`, `list_claims_for_file`, `check_claim`, `close_claim`, `unpin_claim`)
are on this same server; the lab tools remain.

Per-client setup for Claude Code, Cursor, VS Code, Gemini CLI, and Codex is in
[docs/integrations.md](integrations.md).

### Scope and limits (lab)

Worth stating plainly, since the output looks like data:

- **A single trial is not a result.** Model sampling varies. Use at least three
  trials before treating a difference as real.
- **Underpowered is not equivalent.** "Not distinguishable" means the run could
  not see an effect, not that none exists.
- **Scoring is deterministic string matching**, not comprehension. Criteria are
  auditable and frozen before a run, but you should still read the failures.
- **Cross-agent comparisons carry a confound.** Within-agent comparisons are
  the sound use for *quality*. Cross-tool tests for tickets are a *protocol*
  check: did agent B honor a ticket agent A wrote? That is allowed. “Which
  agent is better” is not.
- **Results are scoped to the task set.** Function-selection findings do not
  automatically transfer to code generation — or to “will an agent honor a stamp.”

`diedinchat report` prints these alongside every report.
