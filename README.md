<p align="center">
  <img src="brand/social/diedinchat-hero.png" width="100%" alt="A terminal archivist retrieves a file-bound claim from archived Monday, Tuesday, and Wednesday chat sessions">
</p>

<h1 align="center">diedinchat</h1>

<p align="center"><strong>Your agent agreed to a rule. Then the chat ended, and the rule went with it.</strong><br>diedinchat pins that rule to the files it was about, in git, where the next agent will find it — and tells you when it stops being true.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/diedinchat"><img src="https://img.shields.io/npm/v/diedinchat?color=C7FF35&label=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-11110F.svg" alt="MIT license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18.17-11110F.svg" alt="Node 18.17 or newer"></a>
  <a href="https://github.com/pawankumar94/diedinchat/actions"><img src="https://github.com/pawankumar94/diedinchat/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
</p>

---

## The problem

Monday, you tell Claude Code:

> Auth only goes through `src/middleware.ts`. Don't call `requireUser()` in route handlers.

It agrees. It even refactors a handler to match.

**That sentence now exists in exactly one place: Monday's chat log.** Not in the
repo. Not in a test. Not in CODEOWNERS. Nowhere a machine will ever look again.

Wednesday, you open the same commit in Cursor. Empty chat. You ask for a new
`/admin` route:

```ts
export function admin(req) {
  requireUser(req);        // the rule nobody could see
  return renderAdmin();
}
```

`git diff` shows a perfectly normal new file. Tests pass — they never encoded
"auth lives in one file." Review is where you catch it, if you catch it.

The model wasn't careless. **The constraint was never attached to the files it
was about,** so no later agent could have seen it. Same story, different rules:

| Someone said, in chat | About | What happens next session |
|---|---|---|
| "Don't put SQL in route handlers, only `src/db/`." | `src/db/`, `src/routes/` | An agent inlines a query in a new route |
| "`config.ts` is generated. Edit `config.schema.ts`." | both files | An agent "fixes" the generated file; the next build overwrites it |
| "All prices are integer cents." | `src/money.ts`, `src/billing/` | An agent writes `price * 1.1` in a billing helper |

## Why nothing you already have fixes this

Your repo has four mechanisms for encoding truth, and this falls through all of them.

**Git records changes, not commitments.** It will tell you `admin.ts` was added.
It cannot tell you that adding it broke a promise, because the promise was never
a git object. Git has no type for a sentence about a file.

**Tests lock behaviour, and this isn't behaviour.** "Auth lives in one file" is
structural. Both implementations return the same thing for the same input, so
both go green. You'd have to write a grep-shaped test and remember to keep it.

**CODEOWNERS locks who may touch a path**, and says nothing about what is true of it.

**Agent memory and rules files fight the wrong problem.** `.cursorrules`,
`AGENTS.md`, stored memories, "summarise the last chat" — all of them try to
push *more text* into the next context window. Three things go wrong:

- **They aren't addressed to paths.** A rule in `.cursorrules` is about the
  whole repo or nothing. It cannot fire *because you touched `src/routes/`*, so
  it's either always loaded — diluting the window and costing tokens on every
  turn — or not there when it matters.
- **They never expire.** A memory saying "auth is in middleware" keeps saying it
  after someone refactors `middleware.ts` out of existence. It states a dead
  fact with full confidence, which is worse than saying nothing.
- **They don't travel.** Cursor's memory is not Claude Code's memory. Switch
  tools, or switch machines, and you start over.

There is no object in a repository that means *"this sentence about these files
must stay true."* That is the gap.

## What diedinchat does

One JSON file per constraint, in `.diedinchat/`, committed next to your code.

```json
{
  "id": "auth-surface",
  "text": "Auth only goes through src/middleware.ts.",
  "files": ["src/middleware.ts", "src/routes/"],
  "evidence": ["withAuth"],
  "hashes": { "src/middleware.ts": "sha256…" },
  "status": "supported"
}
```

Three properties follow from that, and they're what the alternatives lack:

**It's addressed to paths.** `diedinchat status src/routes/` returns the two
tickets about that directory and nothing else. An agent about to edit a file
asks a question scoped to that file, instead of carrying every rule you've ever
written in its context.

**It expires.** Every read re-hashes the files. Touch `middleware.ts` and the
ticket flips to `stale` on its own — the belief is now suspect and says so. This
is the part no memory system does: **the claim knows when it might be wrong.**

**It travels.** It's a file in your repo. Cursor, Claude Code, Codex, Copilot,
a teammate, CI — same tickets, because they live next to the code rather than
inside one vendor's session store.

<p align="center">
  <img src="docs/assets/handoff-loop.svg" width="100%" alt="A constraint stated on Monday is pinned into .diedinchat in git; the chat log ends at the session boundary, but the ticket crosses it and a different agent reads it on Wednesday">
</p>

### Four states, computed from disk

No model is involved in deciding these. It's file hashes and string matching, so
the answer is reproducible and auditable.

| Status | Means |
|---|---|
| `open` | Pinned, but nothing frozen to check it against |
| `supported` | Files unchanged and the evidence still holds |
| `stale` | A pinned file changed — the belief may be dead, re-check it |
| `contradicted` | The evidence is gone. Red, the way a test goes red. |

`stale` is the state that matters. Git tells you a file changed; this tells you
a *promise about it* may no longer hold — and it's the reason a ticket doesn't
rot into confident misinformation the way a stored memory does.

## Quickstart

```bash
npx diedinchat pin --text "Auth only goes through src/middleware.ts. Never check auth in a route handler." \
  --file src/middleware.ts --file src/routes/

npx diedinchat install     # teach every agent in this repo to read tickets first
```

```bash
npx diedinchat status src/routes/
```

```text
supported  auth-only-goes-through-src-middleware-ts
           Auth only goes through src/middleware.ts. Never check auth in a route handler.
           files: src/middleware.ts, src/routes
```

| Command | |
|---|---|
| `diedinchat` | status of every ticket (the default; local and free) |
| `diedinchat status <path>` | only tickets covering that path |
| `diedinchat status --json` | machine-readable, for CI |
| `diedinchat pin --text … --file …` | pin a constraint |
| `diedinchat check` | re-evaluate against current files |
| `diedinchat close <id>` / `unpin <id>` | retire it, or delete it |

## Works with the agent you already use

`install` writes the convention into the file each agent already loads — no
server, no config edit:

| Agent | File written |
|---|---|
| <img src="brand/icons/claude.svg" width="16" height="16" valign="middle" /> Claude Code | `.claude/skills/diedinchat/SKILL.md` |
| <img src="brand/icons/cursor.svg" width="16" height="16" valign="middle" /> Cursor | `.cursor/rules/diedinchat.mdc` |
| <img src="brand/icons/copilot.svg" width="16" height="16" valign="middle" /> GitHub Copilot | `.github/instructions/diedinchat.instructions.md` |
| <img src="brand/icons/windsurf.svg" width="16" height="16" valign="middle" /> Windsurf | `.windsurf/rules/diedinchat.md` |
| <img src="brand/icons/cline.svg" width="16" height="16" valign="middle" /> Cline | `.clinerules/diedinchat.md` |
| <img src="brand/icons/gemini.svg" width="16" height="16" valign="middle" /> Gemini / Antigravity | `AGENTS.md`, `skills/…` |
| Any agent | `AGENTS.md`, in a fenced block |

**Over MCP**, for clients that prefer tools to files:

```bash
diedinchat mcp     # pin_claim · list_claims_for_file · check_claim
```

**As a git hook**, when you'd rather not depend on an agent remembering:

```bash
diedinchat install-hook --hook pre-commit
```

That last one is the only path that holds no matter what the agent does. Setup
per client is in [docs/integrations.md](docs/integrations.md).

## Does it change what agents do?

Early signal, honestly bounded: Codex CLI honored **9 of 9 edits with tickets
present and 5 of 9 without** — a +44 point difference, 95% interval +2 to +70,
excluding zero. Scored on the git diff of the workspace, not on what the agent
said it did.

Two caveats you should have before citing that: those prompts told the agent to
consult tickets, so it measures whether tickets change the edits of an agent
*that looks*, not whether one looks unprompted. And the effect is concentrated —
on one of the three constraints the agent got it right unaided either way.
Design, raw records and limits: [docs/evidence/honor-rate.md](docs/evidence/honor-rate.md).

A paired run on real repository issues is the next measurement, designed in
[PLANNER.md](PLANNER.md). Until then, treat the argument above as the reason to
try this, and that number as a mechanism check rather than a promise.

## Status

Usable today for pinning, reading, and checking constraints. This repo uses it
on itself; all four of its tickets are `supported`, and CI fails if one breaks.

Known gaps, in the order they will bite you:

- **A ticket pinned to a directory goes `stale` on any byte change under it**,
  including a comment. On a busy repo, directory tickets thrash.
- **`--file` takes literal paths and directories only** — no globs, and
  directory expansion ignores `.gitignore`.
- **MCP lags the CLI**: `close` and `unpin` aren't exposed, so an MCP-only agent
  can create tickets it can't retire.
- **No developer-value benchmark yet.** See above.

## Documentation

| Doc | Covers |
|---|---|
| [docs/how-it-works.md](docs/how-it-works.md) | The handoff, status derivation, and what is actually guaranteed |
| [docs/integrations.md](docs/integrations.md) | Per-client MCP setup, library usage |
| [docs/evidence/honor-rate.md](docs/evidence/honor-rate.md) | The published result, its design, and its limits |
| [docs/lab.md](docs/lab.md) | The measurement harness used to test claims like the one above |
| [PLANNER.md](PLANNER.md) | What is left to build |
| [AGENTS.md](AGENTS.md) | Entry point for agents working in this repo |

## Development

```bash
npm install
npm test        # 143 tests, no network or agent CLI required
npm run build
npm run typecheck
```

Releases publish from GitHub Actions with npm provenance, so the registry
attests which commit and workflow produced the tarball.

## License

MIT. See [LICENSE](LICENSE).
