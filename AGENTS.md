# AGENTS.md

If you're an agent working in this repo, read [`README.md`](README.md) first
— the problem statement and product direction live there. Then
[`docs/how-it-works.md`](docs/how-it-works.md) for how tickets work, and
[`docs/architecture.md`](docs/architecture.md) for the lab internals
(run/score/report, agent profiles).

**Product direction (do not reverse this in a drive-by):** diedinchat is
file-bound tickets — assertions pinned to paths in `.diedinchat/`, visible
across sessions and agents, flipping `stale` when those files change. The
eval CLI is the *lab* we use to prove that works, not the product. Do not
lead new copy with BFCL or config A/B.

`pin` / `status` / `check`, the `.diedinchat/` store, the MCP verbs, and
the pinning-first `templates/diedinchat.md`, ticket lifecycle, and four
repository-owned tickets have all landed. What is left is phased in
[`PLANNER.md`](PLANNER.md) — read it before starting work. Phase 1 has one
Codex result; replication on another agent remains open.

The claimcheck-era `benchmarks/` runs (BFCL tool count, codex sandbox,
gemini) were deleted with the old direction; the lab *pipeline* stays,
because Phase 1 needs it. Do not restore those results or cite them.

Then [`examples/claim-001-tool-count/`](examples/claim-001-tool-count/) for
the specific *lab* hypothesis, corpus, and what would falsify it.

## Architecture, in one paragraph

Everything agent-specific lives in one place: an agent *profile*
(`profiles/*.json` or a user-supplied path). Tasks (`tasks.json`) and
policies (`policies/*.json`) are pure data with no agent's flags in them.
`src/agents/profile.ts#buildInvocation` is the single function that turns
(profile, policy name, prompt) into a concrete command line -- if you're
looking for "where does an agent's syntax get resolved," it's there and
nowhere else. Supporting a new agent is writing a profile JSON file, not
new code. Tickets live in repo-local `.diedinchat/`, not in
`~/.diedinchat` (lab runs only) and not per-agent.

## Before you trust a result

```bash
npm test
```

This exercises the full run → score → report pipeline against a local git
repo and a fake node-based "agent" -- no real coding-agent CLI or network
access needed. If this doesn't pass cleanly, the pipeline is broken
independently of whatever a real run's `results/report.md` says -- fix this
first.

## Fastest ways to break this project silently

- Adjusting `expected_keywords` in a `tasks.json` *after* looking at a real
  run's output. That's circular -- answer keys are written from the source
  docs, frozen, then runs happen.
- Drawing a conclusion from a single trial per condition, or from a single
  agent. Different agents can interpret the same prompt differently
  regardless of tool policy -- `reporter.ts` calls this out explicitly;
  don't strip that caveat out when summarizing a report for someone.
- Reporting a pass rate that folds in `ERROR` rows (harness failures) or
  `UNVERIFIED ANSWER KEY` tasks without checking them by hand first.
- Adding a second claim's tasks into an existing `tasks.json` instead of a
  new `examples/00N-*/` directory with its own `tasks.json` + `policies/`.
  Claims are independent by design.
- Shipping an agent profile with `"verified": true` without having actually
  run it against a live install of that agent's CLI.
  `profiles/claude-code.json` and the templates in
  `examples/agent-profiles/` show the honest way to flag this:
  `"verified": false` plus a `"verificationNote"` saying exactly what
  hasn't been checked. `run` prints a warning when it sees this -- don't
  silence that warning by flipping the flag instead of doing the
  verification.
- Treating `policyArgs` as portable across agents. "curated" and "full"
  are names for an *intent*; the actual flags behind them are specific to
  each profile and must be defined per agent, never copy-pasted assuming
  another agent's tool-name syntax will parse.
- Rewriting the README problem back into "A/B test your MCP tools" after
  this direction change. The lab stays; it is not the pitch.

<!-- diedinchat:start -->
# diedinchat: file-bound tickets

Use this whenever you assert something about files in this repo — a constraint,
an invariant, a “don’t put X in Y.” That sentence does not belong only in chat.
Pin it to the paths it is about so the next session and the next agent can see it.

## The trap this exists to prevent

Monday: “Auth only goes through `src/middleware.ts`.” Wednesday, different
agent, empty chat: the files are still there, the promise is gone, and a route
handler grows its own `requireUser()`. Git knows what changed. Nothing kept
the sentence.

## The method

1. **Pin assertions to files.** After you state a constraint about the repo,
   write a ticket: `diedinchat pin --text "..." --file src/a.ts` (or call
   `pin_claim`). Do not leave it only in the transcript.

2. **Look before you edit.** Before editing a path, list tickets on it
   (`diedinchat status src/a.ts` or `list_claims_for_file`). Honor open and
   supported tickets. If a ticket is `stale`, re-check it — do not trust a
   promise about a file that has moved.

3. **Freeze evidence before checking.** If the ticket has `evidence` phrases,
   they were written from the files *before* a check, not after seeing a
   failure. Never patch evidence to make a ticket pass. If the key was wrong,
   pin a *new* ticket.

4. **Stale is not contradicted.** A hash change with the frozen evidence still
   present means the file moved and the assertion needs review. Missing frozen
   evidence is contradicted, even when that edit also changed the hash. Re-read
   the file, then re-pin or close the ticket.

5. **Do not compare across agents.** A ticket pinned by Claude and honored
   (or ignored) by Codex is a *protocol* check: did the next agent see it?
   It is not a quality leaderboard.

If neither the CLI nor MCP is installed, still follow the method by hand:
write `.diedinchat/<id>.json` with `text` and `files`, and read that folder
before you edit those paths. The files are the product; the tooling only
removes arithmetic.

## Running it

```bash
diedinchat pin --text "Auth only through middleware." --file src/middleware.ts
diedinchat status src/middleware.ts
diedinchat check auth-only-through-middleware
diedinchat close auth-only-through-middleware
diedinchat status --all
diedinchat unpin auth-only-through-middleware
diedinchat install-hook --hook post-merge
```

MCP: `pin_claim`, `list_claims_for_file`, `check_claim`.

Config A/B (`diedinchat measure`) is the lab for when the claim itself is
“this setup is better.” Freeze keys, repeat trials, report the interval,
never call “not distinguishable” a win. Underpowered is not equivalent.

<!-- diedinchat:end -->
