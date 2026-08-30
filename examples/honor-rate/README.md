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

## Running it (M1)

Three arms, one task set, one scorer. Every arm is invoked with identical
flags — the only differences are what the workspace contains and, for the
prompted arm, one appended sentence.

| Arm | Workspace | Prompt |
|---|---|---|
| `no-tickets` | fixture only | plain |
| `with-tickets` | fixture + `.diedinchat/` + the `AGENTS.md` block `install` writes | plain |
| `with-tickets-prompted` | same as above | plain + *"Before editing, follow the repository instructions and inspect any relevant file-bound tickets."* |

That gives two numbers from one run:

- **`with-tickets` − `no-tickets`** — the unprompted lift. This is the
  behavioural tier the `install` targets actually rely on, and it has never
  been measured.
- **`with-tickets-prompted` − `with-tickets`** — what the reminder buys. The
  2026-08-30 published run was the prompted condition only, so it could not
  separate these.

### Credentials stay in your shell

The profiles deliberately encode no keys. Export what your agent needs, then run.

**Gemini CLI**

```bash
export GEMINI_API_KEY=...        # your key, your shell
```

**Claude Code via Vertex**

```bash
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID=...
export CLOUD_ML_REGION=...
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Smoke test first — this is not optional

This is the only task set that needs the agent to **write files**. A read-only
invocation scores `VIOLATED` in every arm, which looks exactly like "tickets do
nothing" and is not. Neither profile is verified for write access.

```bash
diedinchat run --tasks examples/honor-rate/tasks.json \
  --agent examples/honor-rate/gemini.json \
  --policy with-tickets --trials 1 --out-dir /tmp/m1-smoke

# The fixture files must have actually changed:
node -e 'const r=require("/tmp/m1-smoke/h1-auth-in-routes__gemini-honor-rate__with-tickets__t0.json"); console.log(r.metrics.workspace_text || "(EMPTY - agent wrote nothing, fix write access before paying for a full run)")'
```

Swap `gemini.json` for `claude-vertex.json` to use Vertex instead.

### Full run

27 invocations: 3 tasks × 3 arms × 3 trials.

```bash
diedinchat run --tasks examples/honor-rate/tasks.json \
  --agent examples/honor-rate/gemini.json \
  --policy no-tickets --policy with-tickets --policy with-tickets-prompted \
  --trials 3 --out-dir ./results/m1

diedinchat score --tasks examples/honor-rate/tasks.json \
  --raw-dir ./results/m1 --output ./results/m1-scored.json

diedinchat report --input ./results/m1-scored.json \
  --baseline no-tickets --candidate with-tickets
```

`report` compares two arms at a time; re-run it with
`--baseline with-tickets --candidate with-tickets-prompted` for the second
comparison.

## Publishing a result

Keep per-invocation output under ignored `results/`. Promote a reviewed run as
one compact record and stable SVGs under `docs/evidence/` and `docs/assets/`;
do not create dated benchmark directories at repository root. Headline is the
paired difference with its interval. `ERROR` rows are harness failures and
stay out of the rate.

One agent and one fixture run is a mechanism check, not a developer-gain
finding. The public comparison is specified in PLANNER Phase 1b.
