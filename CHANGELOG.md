# Changelog

Notable changes per release. This project is pre-1.0: minor versions may
change the public API.

## 0.8.0 — 2026-08-30

### Added

- **`diedinchat review`** — which pinned rules a change touches, and whether any
  lost their evidence. Editor-independent: it needs no hook and no cooperation
  from whatever wrote the code, so it covers an agent, a teammate, or a hand
  edit equally. `--markdown` emits a PR comment, `--json` feeds CI, and it exits
  non-zero only on a contradiction. Untracked files are included, because the
  canonical failure is an agent *adding* a file that breaks a rule and `git
  diff` never sees a new file.

### Fixed

Three things that made the pre-write hooks look production-ready without being
so:

- **The adapters assumed `diedinchat` was on `PATH`.** Someone who ran
  `npx diedinchat install-agent-hook` has no global binary and no local
  dependency, so the hook installed cleanly and did nothing. Adapters now
  resolve `node_modules/.bin`, then `PATH`, then `npx -y diedinchat@<version>`
  pinned to the version that generated them.
- **Cursor's hook entry had no `matcher`**, so it spawned a process before every
  agent tool call and exited for non-file ones. Now scoped to `Write|Delete|Edit`.
- **`--fail-closed`.** Adapters fail open by default, which keeps people working
  but is not enforcement. Teams that need the guarantee can now deny the write
  when diedinchat itself cannot be run. Neither default is silently correct, so
  it is a decision made at install time and printed back on install.

## 0.7.0 — 2026-08-30

### Added

- **Cursor pre-write adapter.** `diedinchat install-agent-hook --agent cursor`
  installs a `preToolUse` hook that surfaces the rules covering a file as
  `agent_message` and denies the write when one is contradicted. Same `gate`
  call as the Claude Code adapter; only the wire format differs.
- The installer is now host-driven rather than special-cased, so a third host is
  a table entry: adapter script, config path, and how to merge into it.

### Fixed

- `install-agent-hook` reported "updated" whenever a settings file merely
  existed. It now describes whether *our* hook entry was created or replaced,
  which is the thing the reader cares about.

### Note on what Cursor can gate

`preToolUse` can deny a write. `afterFileEdit` is observational and cannot —
which is why the adapter binds to the former. Neither covers a human editing by
hand; the git hook remains the floor.

## 0.6.0 — 2026-08-30

Constraints now arrive *before* the write, instead of relying on the agent to
remember a lookup.

### Added

- **`diedinchat gate --path <file>`** — resolves the rules covering a path and
  says whether a write should proceed. Exit 0 allows, exit 2 blocks, stdout
  carries the rules as a card to inject. This is the one primitive every adapter
  projects over: pre-write hooks, git hooks and CI all call the same command, so
  nine hosts cannot drift into nine answers about which rules cover a path.
- **`diedinchat install-agent-hook`** — installs a Claude Code `PreToolUse`
  adapter that fires before `Edit`/`Write`/`MultiEdit`. Healthy rules are
  injected as context; a contradicted rule denies the write with the reason.
  Merges into an existing `.claude/settings.json` rather than overwriting it,
  and re-running does not duplicate the entry.
- **`install` warns when git ignores what it just wrote.** `.claude/` and
  `.cursor/` are in a great many .gitignore files — this project's own included
  — and a rule git will not track helps the person who ran install and nobody
  else, which is the failure this tool exists to complain about.

### Notes on what a gate can and cannot do

`stale` never blocks. Reaching `contradicted` requires frozen evidence that is
now gone, which is checkable; `stale` means files moved with nothing frozen to
verify, and it fired on 65% of real commits. Blocking on that would stop work
for noise, and a gate that cries wolf gets switched off.

Gating also needs a host that exposes a pre-write hook. Claude Code and Cursor
do. Copilot's path-scoped instructions are advisory. Nothing can gate what
exposes no gate — git hooks and CI remain the editor-independent backstop.

### Changed

- `docs/integrations.md` leads with the ticket verbs. It previously told MCP
  clients to call `list_agent_profiles` first and walked its example through
  `run_evaluation`, foregrounding the lab in the document that teaches people to
  use the server.

## 0.5.0 — 2026-08-30

### Added

- **`close_claim` and `unpin_claim` over MCP.** An agent reaching diedinchat
  only through MCP could pin tickets and had no way to retire them — `close` and
  `unpin` had been CLI-only since 0.3.0. `list_claims_for_file` also takes
  `includeClosed`, since closed tickets are hidden by default and an MCP client
  otherwise could not see what it had just closed.

### Fixed

- **Removed a Smithery install instruction that never worked.**
  `docs/integrations.md` told you to run
  `npx @smithery/cli install diedinchat --client claude` and linked to a listing
  page. There is no such listing; the link 404s and the command fails. It is
  gone rather than left as a promise the project does not keep.

## 0.4.1 — 2026-08-30

### Fixed

- **The README figures now render on npmjs.com.** They were SVG, which npm
  strips from READMEs while GitHub renders it, so the npm package page showed
  three empty gaps where the evidence should be. The README references PNG
  copies instead, generated from the same SVGs by `npm run chart:png` so the two
  cannot disagree. The SVGs remain in `docs/assets/` and the documentation pages
  still use them.

### Changed

- Figures are no longer shipped in the tarball. npm resolves a README's relative
  image paths against the repository, which is how the brand icons have always
  rendered without being packaged, so 350 kB of charts in every `node_modules`
  bought nothing. 767 kB to 427 kB unpacked.

## 0.4.0 — 2026-08-30

The release where the claims got measured. Four experiments, 117 agent
invocations, every raw record published.

### Fixed

- **`stale` no longer fires on churn.** Frozen evidence now decides a ticket's
  status whenever it exists; a changed hash only produces `stale` when there was
  nothing frozen to check against. Replaying real commit history showed the old
  behaviour firing on **65% of commits for a file-pinned ticket and 97% for a
  directory-pinned one** — a directory ticket went red after a single commit.
  Now 0%, while still catching 11/11 injected breakages, with a deliberately
  muted control scoring 0/11 to prove the harness measures detection and not
  silence. If you are on 0.3.x, this is the reason to upgrade.
- **A profile may declare no `policyArgs`.** Validation rejected an empty map,
  so a profile whose conditions are realized by the workspace could not load at
  all.

### Added

- `Task.label` — human-readable names in reports and charts instead of task ids.
- `Task.inspect_tickets` — capture the ticket store after a run, for experiments
  that measure whether a ticket was written rather than whether one was obeyed.
- `examples/honor-invisible/` and `examples/pin-capture/` — the fixtures behind
  the published results, re-runnable against your own agent.

### Changed

- **`install` now teaches `--evidence`.** Agents were pinning without it, which
  put every agent-created ticket in the noisy mode above. After the template
  change, evidence went from 0/6 to 6/6 of auto-pinned tickets and their status
  from `open` to `supported`.
- Charts render on a transparent background with contrast-measured colours, so
  they read on GitHub's dark theme instead of painting a light card.
- The package no longer ships raw experiment JSON — 193 kB of audit data that
  belongs on GitHub, where the docs' relative links resolve anyway. 635 kB to
  464 kB unpacked.

### Measured

| | |
|---|---|
| Agents follow a rule they cannot infer from the code | **18/20 with a ticket, 0/20 without** (+90 pts, CI +65 to +99) |
| Agents write the ticket themselves when told the convention | 6/6 vs 0/6 (+100 pts, CI +43 to +107) |
| Negative control — a rule they already follow | 10/10 vs 10/10 (+0 pts, CI −22 to +22) |
| Rules the code already demonstrates | no effect, 9/9 in both arms |

Full design, both failure cases, and the raw records are in `docs/evidence/`.
Everything above is Claude Code on `claude-sonnet-4-6`; other agents are
untested.

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
