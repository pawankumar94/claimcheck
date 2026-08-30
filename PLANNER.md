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
| CLI | [`src/cli.ts`](src/cli.ts) | `pin` / `status` (default) / `check` / `close` / `unpin`, JSON output, optional Git hooks. `measure` is explicit, not default |
| MCP | [`src/mcp-server.ts`](src/mcp-server.ts) | `pin_claim`, `list_claims_for_file`, `check_claim` + the lab tools |
| Install | [`src/core/install.ts`](src/core/install.ts), [`templates/diedinchat.md`](templates/diedinchat.md) | Writes pinning discipline into Claude / Cursor / Copilot / `AGENTS.md` / … |
| Tests | [`test/claims.test.ts`](test/claims.test.ts), [`test/hooks.test.ts`](test/hooks.test.ts), [`test/install.test.ts`](test/install.test.ts), [`test/mcp-server.test.ts`](test/mcp-server.test.ts), [`test/runner.test.ts`](test/runner.test.ts) | `npm test` must stay green |
| Name | package `diedinchat`, bin `diedinchat`, GitHub `pawankumar94/diedinchat` | Old `claimcheck` URLs redirect |
| Repository tickets | [`.diedinchat/`](.diedinchat/) | Four real constraints about profiles, ticket location, CLI default, and path containment |

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
4. ~~One real multi-trial run against at least one verified agent profile.~~
   **Done.** Codex CLI 0.147.0 honored 9/9 edits with tickets and 5/9 without,
   a +44 point difference (95% CI +2 to +70), with zero harness errors. Raw
   records, scored output, report, and manual audit are committed in
   [`docs/evidence/honor-rate.md`](docs/evidence/honor-rate.md).

**Done when**

- ~~`npm test` covers fixture load + honor scoring on a fake agent.~~
  **Done**, [`test/honor.test.ts`](test/honor.test.ts) — including a guard
  that the untouched fixture scores `VIOLATED` on every task, which already
  caught one key that a do-nothing agent would have passed.
- ~~A report exists that a skeptic can read without running anything.~~
- ~~README “Still the lab” links that report, not BFCL.~~

**Do not** change `expected_keywords` after seeing the run. Do not declare
victory on one trial or one agent.

---

## Phase 1b — Public developer-gain benchmark (next proof)

The fixture result proves mechanism sensitivity, not developer value. Do not
use 9/9 versus 5/9 as the README headline.

Build a paired, [SWE-bench](https://github.com/SWE-bench/SWE-bench)-derived
handoff evaluation on real GitHub issues:

1. Select a preregistered constraint-relevant subset from public tasks. Freeze
   repository commits, official tests, task selection, and source-backed
   file constraints before running an agent.
2. Run the same task, agent, model, prompt, permissions, and trial count in
   both arms. The only variable is whether the fresh workspace contains the
   relevant `.diedinchat/` ticket.
3. Primary metric: official test-passing issue resolution. Secondary metrics:
   repeated constraint violations, rework, tokens, latency, and harness errors.
4. Compare each agent against itself with at least three trials and a paired
   interval. Test cross-agent ticket handoff separately; it is a protocol test,
   not an agent leaderboard.
5. Publish one stable explanation page under `docs/evidence/`, compact result
   data, and README SVGs. Never restore dated raw-run folders at repository root.

Call this **SWE-bench-derived**, not an official SWE-bench leaderboard result:
the ticket intervention and constraint-relevant subset are ours.

**Done when** the README can state a developer gain such as resolved-task lift
or repeated-mistake reduction on public tasks, with an interval and raw-enough
compact evidence to audit it.

---

## Phase 2 — Ticket lifecycle (complete)

**Completed 2026-08-30.** Closed tickets remain on disk and are hidden from
default status; `--all` includes them. `unpin` removes one validated ticket.
`status --json` and `check --json` expose the same evaluations used by the CLI.
Optional idempotent `pre-commit` and `post-merge` hooks preserve existing hook
content and run the deterministic check. Missing frozen evidence evaluates as
`contradicted` even when the edit also changed the file hash; a hash-only change
that preserves evidence remains `stale`.

`pin` / `status` / `check` are not a product yet. Agents and humans will
need:

| Verb | Behavior |
|---|---|
| `close <id>` | [x] Closed tickets stay on disk; `status` hides them and `--all` shows them |
| `unpin <id>` | [x] Delete exactly one `.diedinchat/<id>.json` |
| `status --json` / `check --json` | [x] Machine output for scripts and CI |
| `check` git hook | [x] Optional idempotent `pre-commit` / `post-merge` installation |

Keep the store a directory of JSON. No sqlite. Path safety stays
`resolveInside` — do not relax it.

Tests go in `test/claims.test.ts` (store) and `test/cli` only if you add a
**Done when** an agent can pin, list, close, unpin, and a hook can mark
stale after `middleware.ts` changes, all without MCP.

---

## Phase 3 — Eat our own cooking (complete)

**Completed 2026-08-30.** Four supported tickets are tracked in
`.diedinchat/`: agent-profile isolation, repository-local ticket storage, bare
CLI status, and path containment. They bind to real implementation files and
carry frozen evidence. `AGENTS.md` was refreshed through `diedinchat install`,
and the README uses these tickets as the worked example.

`diedinchat status` at the repo root lists these tickets, and `check` must
remain green on a clean tree.

---

## Phase 4 — Publish the convention (shipping)

`diedinchat@0.3.0` is on npm, published from GitHub Actions with SLSA
provenance, so the registry attests which commit and workflow built the
tarball. CI runs typecheck / build / test on Node 18.17 and 22 and fails a
release whose tag disagrees with `package.json` or whose tarball exceeds 3 MB.
Releases are cut from a GitHub Release; `workflow_dispatch` runs the same path
with `--dry-run`.

Still open:

- **MCP is behind the CLI.** `close`, `unpin`, and `--json` landed on the CLI
  but the server still exposes only `pin_claim`, `list_claims_for_file`, and
  `check_claim`. An agent that reaches diedinchat only over MCP can create
  tickets and never retire them. Close that gap before advertising MCP.
- Smithery: verify [`smithery.yaml`](smithery.yaml) after a real listing. Do
  not submit the directory until a stranger can pin a ticket without reading
  this file.
- GitHub social preview: human in Settings → `brand/social/og-1280x640.png`.
- 0.2.0 and earlier carry no provenance and cannot get it retroactively.

### Not shipped, and load-bearing

Two defects are known, reproduced, and unfixed. Both bite the first real user,
not the demo:

- **Stale thrash.** A ticket pinned to a directory flips `stale` when any byte
  of any file under it changes, including a comment. On an active repo a
  directory ticket is stale after nearly every commit, and a signal that is
  always red is a signal nobody reads. This is the single most likely reason
  adoption fails.
- **`--file` takes literal paths only.** No globs (`src/**/*.ts` errors), and
  directory expansion ignores `.gitignore`, so pinning a directory hashes build
  output. Note the honor-rate criteria already use globs, so the two halves of
  the product disagree about what a path is.


---

## Phase 5 — IDE chrome (last)

A stamp on a file in the Cursor / VS Code tree. Optional. Same
`.diedinchat/` store, no second format. Do not start this before Phase 3 is
complete and the current CLI lifecycle has been used in this repository.

---

## Phase 6 — Brand (complete; now paused)

The human-approved drawer/archive system is in `brand/`, including the README
hero, social preview, SVG, favicon, and raster sizes. Do not regenerate or
revisit it unless a human explicitly reopens brand work. It does not block the
remaining product phases.

---

## Guardrails (carry these from `AGENTS.md`)

- Do not rewrite the README problem back into “A/B test your MCP tools.”
- Do not rename the package back to `claimcheck`.
- Do not put ticket JSON in `~/.diedinchat` (that dir is lab runs only).
- Do not add a database, daemon, or cloud account to the ticket path.
- One new lab claim = one new `examples/00N-*/` directory.
- `npm test` green before you push.

## Suggested order for the next agent

1. Fix stale thrash, add gitignore-aware path matching, and close MCP lifecycle
   parity. These are product prerequisites, not benchmark work.
2. Build and preregister Phase 1b on a public constraint-relevant task subset.
3. Run the paired comparison on one agent, then repeat the handoff on a second.
4. Review the developer-gain result before expanding listings or building IDE
   chrome.
