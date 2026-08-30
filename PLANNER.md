# PLANNER

Roadmap for agents continuing this repo. Product direction is in
[`README.md`](README.md). Lab internals are in
[`docs/architecture.md`](docs/architecture.md). Do not reverse either.

**Pitch:** an assertion about files died in chat. Pin it to those files so
the next agent, in any tool, can see it. `.diedinchat/` is git-tracked.
Status is `open` / `supported` / `stale` / `contradicted`.

**Not the pitch:** config A/B, BFCL, a leaderboard, agent memory, “did this
chat lie.” The eval CLI is the *lab* we use to prove tickets work.

Icons / visual identity are **paused**. Do not spend a turn regenerating
`brand/` unless a human asks.

---

## Already on `main`

Do not rebuild these. Extend them.

| Surface | Where | What it does |
|---|---|---|
| Ticket store | [`src/core/claims.ts`](src/core/claims.ts), [`src/types.ts`](src/types.ts) `FileClaim` | `.diedinchat/<id>.json`, hashes, walk dirs, `evaluateClaim` |
| CLI | [`src/cli.ts`](src/cli.ts) | `pin` / `status` (default) / `check`. `measure` is explicit, not default |
| MCP | [`src/mcp-server.ts`](src/mcp-server.ts) | `pin_claim`, `list_claims_for_file`, `check_claim` + the lab tools |
| Install | [`src/core/install.ts`](src/core/install.ts), [`templates/diedinchat.md`](templates/diedinchat.md) | Writes pinning discipline into Claude / Cursor / Copilot / `AGENTS.md` / … |
| Tests | [`test/claims.test.ts`](test/claims.test.ts), [`test/install.test.ts`](test/install.test.ts), [`test/mcp-server.test.ts`](test/mcp-server.test.ts) | 129 tests; `npm test` must stay green |
| Name | package `@pawankumar94/diedinchat`, bin `diedinchat`, GitHub `pawankumar94/diedinchat` | Old `claimcheck` URLs redirect |

```bash
npm test
npx tsc --noEmit
```

Bare `diedinchat` is `status`. It must not spend API budget.

---

## Phase 1 — Honor-rate eval (the proof)

**Why this is next.** Without a number, “tickets help the next agent” is a
blog post. The lab already runs A/B. Point it at *tickets*, not tool
policy.

**Hypothesis.** An agent given a coding task that *should* honor a pinned
constraint honors it more often when `.diedinchat/` exists than when the
same constraint lived only in a prior chat (i.e. is absent).

**Build**

1. ~~New example `examples/honor-rate/`: tasks that *violate* a file-bound
   rule if the agent never sees it, two conditions over the same tasks.~~
   **Done.** Fixture app with three rules (auth-in-middleware,
   SQL-under-`src/db/`, money-in-cents), three tasks that each invite the
   violation, keys frozen from the fixture before any run. See
   [`examples/honor-rate/README.md`](examples/honor-rate/README.md).
2. ~~A profile-agnostic way to seed the fixture into the worktree.~~
   **Done.** `TasksDoc.fixture_dir` plus `policy_overlays` in
   [`src/core/runner.ts`](src/core/runner.ts): the fixture is copied into a
   fresh temp dir per invocation and the policy's overlay goes on top, so
   `with-tickets` gets a `.diedinchat/` and `no-tickets` gets nothing. An
   arm realized this way needs no `policyArgs`, so no profile needs editing.
3. ~~Score **honor**, not generic task success.~~ **Done.** `Task.inspect`
   captures the post-run contents of the declared paths into
   `metrics.workspace_text`, and `scoreHonor` in
   [`src/core/scorer.ts`](src/core/scorer.ts) matches `forbid` / `require`
   against *that*, not against the agent's prose. `isPass` is now the one
   definition of a pass, so `HONORED` counts everywhere.
4. **Open.** One real multi-trial run against at least one verified agent
   profile. Write `benchmarks/YYYY-MM-DD-honor-rate/` with raw + scored +
   report. Honor rate with tickets vs without is the headline; do not fold
   `ERROR` rows into the pass rate.

   Blocker to clear first: this is the only task set that needs the agent to
   **write files**. A read-only invocation scores `VIOLATED` in both arms,
   which reads as a null result and is not one. No profile is verified for
   write access here. Confirm on one trial that the files actually changed
   before paying for three.

**Done when**

- ~~`npm test` covers fixture load + honor scoring on a fake agent.~~
  **Done**, [`test/honor.test.ts`](test/honor.test.ts) — including a guard
  that the untouched fixture scores `VIOLATED` on every task, which already
  caught one key that a do-nothing agent would have passed.
- A report exists that a skeptic can read without running anything.
- README “Still the lab” links that report, not BFCL.

**Do not** change `expected_keywords` after seeing the run. Do not declare
victory on one trial or one agent.

---

## Phase 2 — Ticket lifecycle the CLI is missing

`pin` / `status` / `check` are not a product yet. Agents and humans will
need:

| Verb | Behavior |
|---|---|
| `close <id>` | status `supported` is not “done”; closed tickets stay on disk, `status` hides them by default, `--all` shows them |
| `unpin <id>` | delete `.diedinchat/<id>.json` |
| `status --json` / `check --json` | machine output for MCP and CI |
| `check` git hook | `diedinchat check` as a `pre-commit` or `post-merge` optional install, so pull-the-repo flips `stale` without anyone remembering |

Keep the store a directory of JSON. No sqlite. Path safety stays
`resolveInside` — do not relax it.

Tests go in `test/claims.test.ts` (store) and `test/cli` only if you add a
CLI harness; otherwise keep asserting through the functions.

**Done when** an agent can pin, list, close, unpin, and a hook can mark
stale after `middleware.ts` changes, all without MCP.

---

## Phase 3 — Eat our own cooking

This repo currently *describes* tickets and does not have any.

Pin 3–5 real constraints about *this* codebase into `.diedinchat/` (tracked):

- Auth/session examples in the README are *illustrative*; do not invent
  app files. Pin things that are true here, e.g. “agent-specific flags
  live only in `profiles/*.json`”, “ticket store is `.diedinchat/`, not
  `~/.diedinchat`”, “bare CLI is `status`, not `measure`”.
- `diedinchat install` already runs against `AGENTS.md`; after pinning,
  `diedinchat status` in this repo should print those tickets.
- Add `.diedinchat/` to docs as the worked example, not a screenshot of a
  fake app.

**Done when** `diedinchat status` at the repo root lists tickets and
`check` is green on a clean tree.

---

## Phase 4 — Publish the convention

Not before Phase 1 has a number, unless a human says ship anyway.

- npm: `@pawankumar94/diedinchat` — `files` in `package.json` already
  includes `dist`, `templates`, `skills`, `profiles`, `examples`.
- Smithery: [`smithery.yaml`](smithery.yaml) already points at the new
  name; verify the listing after publish.
- [`docs/integrations.md`](docs/integrations.md) still says “Not yet on
  npm” — flip that the day it is.
- GitHub About / topics (`mcp`, `cli`, `coding-agents`) and social
  preview: human in Settings. Description should stay the pitch, not the
  lab.

---

## Phase 5 — IDE chrome (last)

A stamp on a file in the Cursor / VS Code tree. Optional. Same
`.diedinchat/` store, no second format. Do not start this while Phase 1
is open — a marketplace listing without a honor-rate number is a skin.

---

## Phase 6 — Brand (paused)

Name is `diedinchat`. Current `brand/` is still the old stamp + files
mark from `claimcheck`. When a human unpauses this:

- New mark has to read at 16px and match the *name* (chat that is gone,
  next agent doesn’t know). Not a robot mascot, not AI-generated slop,
  not the old ticket/stamp.
- Canonical files: `brand/svg/diedinchat-icon.svg`, favicon, social
  `1280×640`, then rasterize PNGs. Update README `<img>` and
  `brand/BRAND.md`.
- Do not block Phases 1–3 on this.

---

## Guardrails (carry these from `AGENTS.md`)

- Do not rewrite the README problem back into “A/B test your MCP tools.”
- Do not rename the package back to `claimcheck`.
- Do not put ticket JSON in `~/.diedinchat` (that dir is lab runs only).
- Do not add a database, daemon, or cloud account to the ticket path.
- One new lab claim = one new `examples/00N-*/` directory.
- `npm test` green before you push.

## Suggested order for the next agent

1. Phase 1 (honor-rate example + scorer + one real run).
2. Phase 2 (`close` / `unpin` / `--json`).
3. Phase 3 (pin this repo).
4. Stop and show the honor-rate number before publishing or building an
   IDE extension.
