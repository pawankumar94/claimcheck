# Claim 001: fewer tools improves agent task success

## The claim, as commonly stated

"Reducing the number of tools exposed to an agent improves its task success
rate", asserted across dozens of 2026 posts on MCP/context bloat, always as
an anecdote ("I cut our tool count and it felt faster / worked better"),
never as a controlled comparison against the same tasks.

## Hypothesis

H1: On read-only repository-comprehension tasks, an agent restricted to a
narrow, task-appropriate tool set (`curated`) matches or exceeds the task
success rate of an agent with a broad, less-restricted tool set (`full`),
at lower token cost.

This is deliberately the weakest defensible version of the claim: all tasks
are answerable with the curated tools, so this tests whether *extra,
unneeded* tool surface hurts, not whether cutting tools you actually need
hurts (it obviously would; that's not interesting).

## What would falsify it

`full` achieves equal or higher success at equal or lower token cost than
`curated`, on this task set. That would mean the popular claim doesn't hold
even in its friendliest form, and the real cost of tool bloat (if real) lies
elsewhere, e.g., in the token overhead of the tool *schemas* themselves,
not in the model's ability to choose correctly among them.

## Corpus

Public repo: [`pawankumar94/nocontext`](https://github.com/pawankumar94/nocontext),
frozen at a specific commit (pin the SHA in `tasks/tasks.json` before a real
run, since the repo is under active development and answers will drift).

## Conditions

See `README.md#conditions`. Same prompt text, same model, same repo
checkout, only `--allowedTools` differs.

## Metrics

- Task success (keyword match against a pre-registered answer key, see
  `tasks/tasks.json`). Pre-registered means the answer key is written before
  any run, from the docs directly, not adjusted after seeing outputs.
- Total tokens / `total_cost_usd` per task (from `--output-format json`).
- Wall-clock latency per task.

## What this pilot is not claiming

- Not statistically powered. n=8 tasks, single trial per condition per task.
  A real publishable result needs multiple trials per condition (model
  sampling varies) and ideally more tasks. Report the pilot as directional,
  full stop, this is exactly the discipline `nocontext` learned the hard
  way to apply to itself.
- Not a claim about MCP tool schema token overhead, that's a different,
  measurable question (the schemas cost tokens regardless of whether the
  model chooses well among them) and deserves its own claim file, not a
  footnote on this one.
- Not a claim about *your* setup. One corpus, one task shape (repo
  comprehension). Different task types may show a different result -
  say so explicitly if you extend this.

## Before publishing anything

Re-run with at least 3 trials per task per condition if the result looks
interesting enough to write about, a single trial can't distinguish signal
from model sampling noise.
