<p align="center">
  <img src="brand/png/icon-256.png" width="220" alt="claimcheck">
</p>

<h1 align="center">claimcheck</h1>

<p align="center"><strong>Pin what an agent asserted to the files it was about.<br>The chat dies. The ticket does not.</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-145C60.svg" alt="MIT license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18.17-2DB8A8.svg" alt="Node 18.17 or newer"></a>
</p>

## The problem

Monday, Claude Code in this repo:

> Auth only goes through `src/middleware.ts`. Don’t put checks in route handlers.

That sentence is a **claim about files**. It is true. It is also trapped in Monday’s chat.

Wednesday you open the same repo in Cursor, or Codex, or a new Claude session. The files are still there. The promise is gone. The new agent adds `requireUser()` in a route because nothing told it not to. You find out in review.

That is not the model being dumb. It is **fragmented context**: assertions that cite files live in a transcript no other agent will read.

Git tells you what changed. Chat told you what was true. Nothing joins them.

Tests lock behavior. CODEOWNERS lock who may touch a path. **Nothing locks the sentences agents keep losing when the session ends.**

## What we are building

A ticket pinned to paths, stored in the repo, visible to whatever agent opens it next.

```json
{
  "id": "auth-surface",
  "text": "Auth only goes through src/middleware.ts. Do not check auth in route handlers.",
  "files": ["src/middleware.ts", "src/routes/"],
  "status": "open"
}
```

`.claims/auth-surface.json` is git-tracked. It is not in anyone’s chat.

Three things that ticket does:

1. **Handoff** — the next agent, in any tool, sees the promise before editing those paths.
2. **Stale** — you pull, `middleware.ts` changed, the ticket flips to `stale`. Git says the file moved; this says a *belief* may be dead. No LLM required.
3. **Contradicted** — an edit breaks the frozen evidence. The ticket goes red, the way a test goes red.

It is not agent memory (“remember I like tabs”). It is not a leaderboard. It is not “did this chat lie.” It is a **test for a sentence about files**.

## How it works with every agent

There is no world where we ship twelve deep IDE plugins first. The product that can be industry-wide is a **convention in the repo**, then adapters:

| Layer | What | Who it hits |
|---|---|---|
| **Files** | `.claims/` in git | Every tool that can read the project |
| **Install** | One rule written into the file each agent already loads | Claude, Cursor, Copilot, Codex, Gemini, Windsurf, Cline, `AGENTS.md` |
| **MCP** | `pin_claim` / `list_claims_for_file` / `check_claim` | Any MCP client, same server |
| **IDE chrome** | Stamp on a file in the tree (later) | Cursor / VS Code — optional |

Same tickets if you switch tools, because they live next to the code.

```
You:  "don't put auth in routes, only middleware"
Agent: pin → .claims/auth-surface.json

--- days later, different IDE, empty chat ---

You:  "add a /admin route"
Agent: list tickets on src/routes/ → sees the stamp → puts auth in middleware
```

`claimcheck install` already writes into those instruction files. The template now teaches pinning and checking tickets, with the lab method as a footnote.

## Where we are

**Shipping on this branch:** `pin` / `status` / `check`, a `.claims/` store,
MCP tools (`pin_claim`, `list_claims_for_file`, `check_claim`), and an
install template that teaches pinning rather than only evals. Bare
`claimcheck` is now `status` (local, free), not a budget-spending measure.

```bash
claimcheck pin --text "Auth only through middleware." --file src/middleware.ts
claimcheck status src/middleware.ts
claimcheck check
```

**Still the lab:** `claimcheck measure` A/B-tests a coding-agent config
against frozen tasks. Use it to prove tickets work (honor rate with vs
without `.claims/`), not as the homepage claim.

If you are here to run the lab, skip to [Lab: measuring a config claim](#lab-measuring-a-config-claim).

---

## Lab: measuring a config claim

This is what the CLI does today. It answers a narrower question: *did this agent-config change actually help, or is that a vibe?*

```bash
git clone https://github.com/pawankumar94/claimcheck.git && cd claimcheck
npm install && npm run build && npm link
claimcheck
```

It finds whichever agent CLI you already have, runs a public benchmark against
it twice (once with a lean tool surface, once with a cluttered one), and tells
you whether the difference is real or noise.

> **Not yet on npm.** The clone-and-link above is the working install today.
> Once published, that becomes `npx @pawankumar94/claimcheck`.

### What a result looks like

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

That is the point of the lab. Not a leaderboard number, but a bounded answer
to "did this change do anything." Full write-ups, charts, and the caveats that
bound them are in [benchmarks/](benchmarks/).

The same honesty applies when we evaluate file tickets: freeze the keys,
change one thing (`with-tickets` vs `no-tickets`), report the interval on
violation rate. A demo is not a result.

### Teach your agent the method

```bash
claimcheck install
```

It detects which coding agents your project uses and writes claimcheck's method
into the file each one already reads:

| Agent | File written |
|---|---|
| <img src="brand/icons/claude.svg" width="16" height="16" valign="middle" /> Claude Code | `.claude/skills/claimcheck/SKILL.md` |
| <img src="brand/icons/cursor.svg" width="16" height="16" valign="middle" /> Cursor | `.cursor/rules/claimcheck.mdc` |
| <img src="brand/icons/copilot.svg" width="16" height="16" valign="middle" /> GitHub Copilot | `.github/instructions/claimcheck.instructions.md` |
| <img src="brand/icons/hermes.png" width="16" height="16" valign="middle" /> Hermes Agent | `.hermes/skills/claimcheck/SKILL.md` |
| <img src="brand/icons/windsurf.svg" width="16" height="16" valign="middle" /> Windsurf | `.windsurf/rules/claimcheck.md` |
| <img src="brand/icons/cline.svg" width="16" height="16" valign="middle" /> Cline | `.clinerules/claimcheck.md` |
| <img src="brand/icons/gemini.svg" width="16" height="16" valign="middle" /> Antigravity / Gemini | `skills/…`, `AGENTS.md` |
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
claimcheck                     # quick look
claimcheck --full              # whole task set, 3 trials
claimcheck --agent codex --yes
```

Its tasks and ground truth come from the
[Berkeley Function Calling Leaderboard](https://github.com/ShishirPatil/gorilla),
so the corpus is not self-authored. See
[examples/bfcl-tool-count/](examples/bfcl-tool-count/).

Authoring your own tasks is the extension path, not the starting point. When
you want it, the pipeline is four commands and the formats are in
[docs/architecture.md](docs/architecture.md):

```bash
claimcheck run --tasks my-tasks.json --agent codex --policy a --policy b --trials 3
claimcheck score --tasks my-tasks.json
claimcheck report
claimcheck chart
```

### How the lab works

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
code.

### Agent support

| Agent | Profile | Status |
|---|---|---|
| <img src="brand/icons/claude.svg" width="16" height="16" valign="middle" /> **Claude Code** | [`claude-code.json`](profiles/claude-code.json) | Verified end to end. Invokes CLI in `--bare` mode; flags, output parsing, and cost reporting verified. |
| <img src="brand/icons/gemini.svg" width="16" height="16" valign="middle" /> **Gemini CLI** | [`gemini-cli.json`](profiles/gemini-cli.json) | Verified end to end. Reports tokens rather than USD, so `cost` shows `n/a`. |
| <img src="brand/icons/openai.svg" width="16" height="16" valign="middle" /> **Codex CLI** | [`codex.json`](profiles/codex.json) | Verified end to end. Policy axis is `--ignore-user-config`, so the contrast depends on how many MCP servers you have configured. |
| <img src="brand/icons/cursor.svg" width="16" height="16" valign="middle" /> **Cursor CLI** | [`examples/agent-profiles/`](examples/agent-profiles/) | Template only, flags unverified. |
| Anything else | | Write a profile, see below. |

Every profile records its own verification status, and `claimcheck run` warns
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
claimcheck mcp
```

Two paths are exposed today. **In-agent** (`start_run`, `submit_answers`,
`compare_runs`) has the agent you are already talking to answer the tasks
itself. **Subprocess** (`list_agent_profiles`, `run_evaluation`,
`score_results`, `generate_report`) drives an external agent CLI through a
profile. Ticket verbs (`pin_claim`, `list_claims_for_file`, `check_claim`)
are on this same server; the lab tools remain.

Per-client setup for Claude Code, Cursor, VS Code, Gemini CLI, and Codex is in
[docs/integrations.md](docs/integrations.md).

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

`claimcheck report` prints these alongside every report.

## Development

```bash
npm test        # 109 tests, no network or agent CLI required
npm run build
npm run typecheck
```

The suite covers the full lab pipeline with a stub agent and a local git repo, so
you can validate changes without spending API budget.

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Internals and extension points |
| [docs/integrations.md](docs/integrations.md) | Per-client setup, library usage |
| [AGENTS.md](AGENTS.md) | Entry point for coding agents working in this repo |

## Adding a lab claim

Copy [examples/bfcl-tool-count/](examples/bfcl-tool-count/) or
[examples/claim-001-tool-count/](examples/claim-001-tool-count/): a new
`tasks.json` plus policies, reusing whatever agent profiles you already have.
Claims are independent, and nothing assumes there is only one.

## License

MIT. See [LICENSE](LICENSE).
