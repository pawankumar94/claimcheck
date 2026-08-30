# honor-rate: does a pinned ticket change what an agent writes?

This is [PLANNER.md](../../PLANNER.md) Phase 1. Everything else in this repo
asserts that file-bound tickets help. This is the thing that could show they
do not.

The first small Codex run is retained as
[`docs/evidence/honor-rate.md`](../../docs/evidence/honor-rate.md). It is a
mechanism check, not the developer-value benchmark or a cross-agent result.

## The hypothesis

An agent asked for an ordinary feature honors a constraint about those files
more often when the constraint is pinned in `.diedinchat/` than when it lived
only in a chat session that has since ended.

## What would falsify it

Honor rate is the same in both arms, or the interval on the difference spans
zero at a sample size large enough to have seen a real effect. Either says the
ticket did not change behavior, and the README claim has to come down.

## The two arms

Same fixture, same prompts, same order. One thing differs:

| policy | what the agent's workspace contains |
|---|---|
| `with-tickets` | `fixture/` + `overlay-with-tickets/` — three tickets in `.diedinchat/`, and the `AGENTS.md` block `diedinchat install` writes |
| `no-tickets` | `fixture/` alone — no ticket, no `AGENTS.md`, no mention of the rule anywhere in the tree |

`no-tickets` has no overlay directory on disk on purpose. An arm whose
manipulation is "add nothing" has nothing to commit, and a placeholder file
would be one more thing in the tree for the agent to read. The runner treats a
missing overlay as adding nothing.

The overlay is applied per invocation, into a fresh temporary copy, so the
arms cannot contaminate each other and an agent with write access cannot leave
state behind for the next trial.

## The fixture

A small app with three rules that are true of it and stated nowhere in its code:

| Rule | Files | The violation a task invites |
|---|---|---|
| Auth only in `src/middleware.ts` | `src/middleware.ts`, `src/routes/` | a new handler calling `requireUser()` itself |
| SQL only under `src/db/` | `src/db/`, `src/routes/` | a `SELECT` inlined in a handler |
| Money is integer cents | `src/money.ts`, `src/billing/` | `* 0.9` for a 10% discount |

Each task asks for a plainly reasonable feature. The obvious implementation
breaks a rule. Nothing in the prompt mentions the rule in either arm — that is
the point.

## How this is scored

Not on what the agent said. `Task.inspect` names the paths whose contents are
read back *after* the invocation, and `Task.honor` is matched against those
contents:

- `forbid` — the pattern the ticket exists to prevent. Any hit is `VIOLATED`.
- `require` — what the finished work must contain. This is what stops an agent
  that writes nothing from scoring `HONORED` on an untouched fixture.

An agent that explains the rule correctly in prose and then writes code that
breaks it is `VIOLATED`, which is why honor is not scored on `result_text`.

`test/honor.test.ts` asserts the untouched fixture scores `VIOLATED` on every
task. That guard exists because an early draft of the `h2` key was already
satisfied by the fixture, so a do-nothing agent would have scored `HONORED`.

The keys were authored from the fixture before any run and are frozen. If one
turns out to be badly specified, fix it in a new task set with its own run —
do not patch it after seeing output.

## Running it

```bash
diedinchat run \
  --tasks examples/honor-rate/tasks.json \
  --agent claude-code \
  --policy with-tickets --policy no-tickets \
  --trials 3
diedinchat score --tasks examples/honor-rate/tasks.json
diedinchat report --baseline no-tickets --candidate with-tickets
```

`fixture_dir` and the overlays resolve relative to `tasks.json`, so this runs
from any directory.

### Before you spend budget on this

**The agent must be able to write files.** Every other task set in this repo
asks a question and reads an answer; this one requires the agent to edit its
workspace, and an invocation with read-only tools will score `VIOLATED`
everywhere in both arms — which looks like a null result and is not one. No
profile in `profiles/` has been verified for write access under this task set.
Check that first, on one trial, and confirm the files actually changed before
paying for three.

The arms need no `policyArgs` entry: they are realized by the workspace, not
by flags, so any profile can run them unedited.

## Publishing a result

Keep per-invocation output under ignored `results/`. Promote a reviewed run as
one compact record and stable SVGs under `docs/evidence/` and `docs/assets/`;
do not create dated benchmark directories at repository root. Headline is the
paired difference with its interval. `ERROR` rows are harness failures and
stay out of the rate.

One agent and one fixture run is a mechanism check, not a developer-gain
finding. The public comparison is specified in PLANNER Phase 1b.
