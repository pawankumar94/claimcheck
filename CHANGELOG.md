# Changelog

Notable changes per release. This project is pre-1.0: minor versions may
change the public API.

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
