# AGENTS.md

Start with [`README.md`](README.md) for what this is and how to run it, and
[`claims/001-tool-count-reduction.md`](claims/001-tool-count-reduction.md)
for the specific hypothesis, corpus, and what would falsify it. There is
deliberately no PLANNER.md yet -- this repo has produced zero real results
so far, and writing a phased roadmap before that happened is exactly the
mistake its sibling project `nocontext` made. Add one only once a real run
exists to plan around.

## Before you trust a result

```bash
python3 runner/score.py --input results/fixtures/sample_raw.json --output /tmp/scored.json
python3 runner/report.py --input /tmp/scored.json --output /tmp/report.md
```

If that doesn't reproduce cleanly, the pipeline is broken independently of
whatever `results/report.md` from a real run says -- fix this first.

## Fastest ways to break this project silently

- Adjusting `expected_keywords` in `tasks/tasks.json` *after* looking at a
  real run's output. That's circular -- the whole reason nocontext separated
  diagnose/evaluate. Answer keys are written from the source docs, frozen,
  then runs happen.
- Drawing a conclusion from a single trial per condition. `claims/001-*.md`
  says this explicitly: not statistically powered below `--trials 3`.
- Reporting a pass rate that folds in `ERROR` rows (harness failures) or
  `UNVERIFIED ANSWER KEY` tasks without checking them by hand first.
- Adding a second claim's tasks into `tasks/tasks.json` instead of a new
  `claims/00N-*.md` + its own task file. Claims are independent by design.
- Treating a `--allowedTools`/`--bare`/`--permission-mode` change as safe
  without re-verifying against `claude --help` on the machine that will
  actually run it -- this scaffold was built without access to a real
  `claude` CLI to test against; the flags are correct as of the headless
  docs at scaffold time, not confirmed against a live invocation.
