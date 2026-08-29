# claimcheck

Tests one specific, widely repeated claim about agentic tooling against a real
agent, on a real public repo, with real numbers — instead of another anecdote.

**Claim under test (pilot):** "Reducing the number of tools an agent can use
improves its task success." Everyone in the current MCP/context-bloat
discourse asserts a version of this. Searching for a controlled before/after
test of it turned up none — every hit was "I cut tools, it felt better."
This repo runs the actual comparison.

## What this is not

Not a benchmark suite, not a product, not a claim about *your* setup. One
claim, one corpus, one comparison. See `claims/001-tool-count-reduction.md`
for the full spec, including what would falsify the hypothesis and the
sample-size caveat — this is a pilot with n=8 tasks, single run per
condition. Directional signal only. Do not publish it as a statistically
powered result.

## How it works

1. `tasks/tasks.json` — 8 read-only comprehension questions about a public
   repo ([`nocontext`](https://github.com/pawankumar94/nocontext)), each with
   an answer key (`expected_keywords`) extracted from the repo's own docs.
   Tasks marked `"verified": false` need a manual check against the source
   file before you trust the answer key — see the note in that file.
2. `configs/full.json` and `configs/curated.json` — two `--allowedTools`
   policies for `claude --bare -p`. Same prompt, same model, same repo,
   different tool surface. See [Conditions](#conditions).
3. `runner/run.py` — clones the target repo fresh per run (isolates state,
   since the full condition can write/edit), invokes `claude --bare -p`
   under each config, and logs the raw JSON result.
4. `runner/score.py` — keyword-matches each response against its answer key.
5. `runner/report.py` — aggregates into a markdown table: pass/fail, tokens,
   latency, per task and per condition.

## Conditions

Uses `claude --bare -p` (skips project hooks/CLAUDE.md/auto-MCP for a clean,
reproducible baseline — same result on any machine) with `--allowedTools`
restricting the tool surface:

| | full | curated |
|---|---|---|
| `Read` | yes | yes |
| `Edit` | yes | no |
| `Bash` | unrestricted | `grep`, `find`, `cat`, `ls`, `sed -n` only (permission-rule syntax, e.g. `Bash(grep *)`) |

Every task is answerable read-only, so `curated` should in principle do no
worse than `full` if the claim holds. If `full` does as well or better,
that's evidence against it — report it either way.

## Running it for real

Requires the `claude` CLI installed and authenticated (`ANTHROPIC_API_KEY`
set, since `--bare` doesn't use subscription login). This costs real API
spend — 8 tasks x 2 conditions x however many trials you run.

```bash
pip install -r requirements.txt   # stdlib only today; placeholder if that changes
python3 runner/run.py             # populates results/raw/
python3 runner/score.py           # writes results/scored.json
python3 runner/report.py          # writes results/report.md
```

Before spending API budget on a real run, verify the CLI syntax still
matches your installed version — flags shift between releases:

```bash
claude --help | grep -A2 allowedTools
claude --bare -p "Summarize README.md" --allowedTools "Read" --output-format json | jq .
```

`runner/run.py` isolates the exact `claude` invocation in one function
(`invoke_claude`) so a flag rename is a one-line fix, not a rewrite.

## Verifying the pipeline without spending API credits

`results/fixtures/sample_raw.json` is a small set of fabricated raw results
in the same shape `run.py` produces. Run the scoring and report steps
against it to confirm the pipeline itself works before wiring in real calls:

```bash
python3 runner/score.py --input results/fixtures/sample_raw.json --output /tmp/scored.json
python3 runner/report.py --input /tmp/scored.json --output /tmp/report.md
cat /tmp/report.md
```

## Adding a second claim

Copy `claims/001-tool-count-reduction.md` as a template, write a new
`tasks/*.json`, and reuse `runner/`. Each claim is independent — nothing here
assumes there's only ever one.
