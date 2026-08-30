# Changelog

Notable changes per release. This project is pre-1.0: minor versions may
change the public API.

## 0.3.1 — 2026-08-30

A correctness fix in how status is derived, plus the documentation catching up
to it. 0.3.0 shipped before this landed, so npm users should take this one.

### Fixed

- **A ticket whose frozen evidence is gone now reports `contradicted`, even
  when the pinned file also changed.** Previously the hash check ran first, so
  a single commit that both edited a file and removed its evidence reported
  `stale` — routine churn hiding the one status that means something actually
  broke. Contradiction is now checked immediately after `closed`.

  This is a behaviour change, not only an internal one: a ticket that reported
  `stale` under 0.3.0 may report `contradicted` here. That is the point. If you
  script against `status --json`, read the new order in
  [docs/how-it-works.md](docs/how-it-works.md).

### Documentation

- `docs/how-it-works.md` describes the ticket product — the cross-session
  handoff, how status is derived, and the guarantee boundary between what holds
  deterministically and what depends on an agent choosing to look.
  `docs/architecture.md` remains the lab.
- The honor-rate record now discloses that every prompt in that run instructed
  the agent to inspect tickets. The +44 point result therefore measures whether
  tickets change the edits of an agent that consults them, not whether an
  unprompted agent consults them at all. It also notes that the maintained
  fixture in `examples/honor-rate/` has different prompts and will not
  reproduce those numbers.
- All SVGs consolidated under `docs/assets/`.

### Known gaps

Unchanged from 0.3.0, and still the things a first real user hits:

- A ticket pinned to a directory flips `stale` on any byte change under it.
- `--file` takes literal paths only — no globs, no `.gitignore` awareness.
- The MCP server exposes `pin_claim`, `list_claims_for_file`, and
  `check_claim`, but not `close` or `unpin`. An agent reaching diedinchat only
  over MCP can create tickets it cannot retire.

## 0.3.0 — 2026-08-30

The release where the claim stopped being an assertion. First published
honor-rate result, a ticket lifecycle you can actually complete, and this repo
finally using its own tool.

### Added

- **`close <id>` and `unpin <id>`.** A ticket that is finished or wrong now has
  an exit. `close` keeps the file and hides it from `status` unless `--all`;
  `unpin` deletes it. Until now the only way to retire a ticket was editing
  JSON by hand.
- **`--json` on `status` and `check`**, so CI and MCP clients can consume the
  output instead of parsing a human table.
- **`install-hook`** writes an optional `pre-commit` or `post-merge` git hook
  running `diedinchat check`. This is the first deterministic consumption path:
  it does not depend on an agent choosing to look.
- **`.diedinchat/` in this repo.** Four constraints about diedinchat itself are
  now pinned and `supported`. The tool is used by the project that ships it.

### Evidence

- **First honor-rate result**, in `benchmarks/`. Codex, 3 tasks x 3 trials per
  arm, scored on the git diff of the workspace rather than on the agent's
  prose:

  | arm | honored |
  |---|---|
  | `with-tickets` | 9/9 (100%) |
  | `no-tickets` | 5/9 (56%) |

  **+44 points, 95% CI +2 to +70.** The interval excludes zero.

  Read the caveats before citing this. n=9 per arm detects only large effects.
  One agent, one model. The task prompts instructed the agent to consult
  repository instructions, so this measures whether tickets help *an agent that
  looks* -- not whether an unprompted agent looks on its own. The per-task
  breakdown also shows the effect concentrated rather than uniform. It is a
  real result and it is not the whole claim.

### Changed

- Releases now publish from GitHub Actions with `--provenance`, so npm can
  attest which commit and workflow produced the tarball. 0.3.0 is the first
  signed release; 0.2.0 and earlier have no attestation and cannot get one
  retroactively.

### Known gaps

- A ticket pinned to a directory still flips `stale` on any byte change to any
  file under it, including a comment. Pinning a directory in an active repo
  will thrash.
- `--file` takes literal paths and directories; no globs, and directory
  expansion does not respect `.gitignore`.
- No handoff or work-state object. Tickets record constraints about files, not
  what a previous session finished or planned next.

## 0.2.0 — 2026-08-30

The release where the eval stopped being about tool policy and started being
about tickets.

### Added

- **Honor-rate evaluation harness.** `examples/honor-rate/` is a fixture app
  with three rules that are true of it and written down nowhere in it, plus
  three tasks whose obvious implementation breaks one. Two arms differ only in
  whether `.diedinchat/` is in the tree.
- `TasksDoc.fixture_dir` and `TasksDoc.policy_overlays` — a task set can ship
  its own fixture and seed a per-arm overlay into a fresh workspace per
  invocation, so the arms cannot contaminate each other. An arm realized this
  way needs no `policyArgs`, so no agent profile has to be edited to run it.
- `Task.inspect` and `Task.honor` — honor is scored against the files the agent
  left behind (`metrics.workspace_text`), not against its prose. An agent that
  explains a rule correctly and then writes code breaking it is `VIOLATED`.
- `scoreHonor` and `isPass` are now exported from the package root.

### Changed

- `isPass` is the single definition of a pass. `analysis`, `reporter`, and
  `chart` each tested `startsWith("PASS")` independently and would have
  reported every honor task as a 0% rate.
- Package contents trimmed from 7.1 MB to roughly 1 MB unpacked: `brand/`
  (5.1 MB of README art that npm resolves from GitHub anyway) and
  `examples/bfcl-tool-count/` (1.5 MB of lab corpus) are no longer shipped.
  Both remain in the repository. `docs/` is now shipped, so the README's links
  to it resolve.

### Removed

- The claimcheck-era `benchmarks/` results (BFCL tool count, codex sandbox,
  gemini CLI). They measured agent config A/B, which is not what this project
  is. The lab pipeline stays, because the honor-rate work needs it.

### Known gaps

- **No published honor-rate number yet.** Nothing in this release is evidence
  that tickets change agent behavior. See `PLANNER.md` Phase 1.
- No `close` or `unpin`. A ticket that is done or wrong has no exit.
- A ticket pinned to a directory flips `stale` on any byte change to any file
  under it, including a comment. Pinning a directory in an active repo will
  thrash.
- `--file` takes literal paths and directories; globs are not supported, and
  directory expansion does not respect `.gitignore`.

## 0.1.1 — 2026-08-29

- First published release. Name hold, not a launch.
- `.diedinchat/` ticket store with sha256 file hashes; `stale` and
  `contradicted` detection with no model involved.
- CLI `pin` / `status` (default) / `check`; `measure` for the lab.
- MCP `pin_claim`, `list_claims_for_file`, `check_claim`, plus the lab tools.
- `install` writes the convention into 9 targets: Claude Code, Cursor,
  Copilot, Windsurf, Cline, Hermes, Agent Skills, `.agents/skills`, `AGENTS.md`.
