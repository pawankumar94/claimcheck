# Example: BFCL tool-count contrast

A task set imported from the **[Berkeley Function Calling Leaderboard
(BFCL)](https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard)**,
not authored here. That is the point: the questions and the correct answers
come from a public benchmark, so the corpus cannot be shaped to fit a result.

## What it tests

Each BFCL entry pairs a user request with candidate function specifications
and a ground-truth call. The import holds the question and its correct answer
fixed and varies **only how many irrelevant functions are shown alongside the
right one**:

| policy | functions shown |
|---|---|
| `few-tools` | the entry's own candidates (typically 2) |
| `many-tools` | the same candidates plus 40 real distractors drawn from other entries |

That is a ~21× contrast, in the same range as the published work this claim
comes from (K=5 vs K=50 over registries of 370–3,251 tools). The earlier
hand-written task set varied roughly 5 tools vs 8, which is why it could not
detect anything.

Distractors are real function specs from other entries, never synthetic
filler, and any distractor sharing a name with the correct answer is excluded
so the wide arm can never change what the right answer is.

## Regenerating

```bash
curl -sfLO https://raw.githubusercontent.com/ShishirPatil/gorilla/main/berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multiple.json
curl -sfL -o gt.json https://raw.githubusercontent.com/ShishirPatil/gorilla/main/berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multiple.json

claimcheck import-bfcl --entries BFCL_v4_multiple.json --ground-truth gt.json \
  --few 0 --many 40 --limit 30 --seed 1 --output tasks.json
```

The import is deterministic for a given seed, so it reproduces byte-identically.

## Running

```bash
claimcheck run --tasks examples/bfcl-tool-count/tasks.json \
  --agent codex --policy few-tools --policy many-tools --trials 3
claimcheck score --tasks examples/bfcl-tool-count/tasks.json
claimcheck report && claimcheck chart
```

No repository is cloned, since each prompt carries its own function specs, and the
policy needs no agent flags, since the variable lives entirely in the prompt.
That makes this task set runnable against **any** agent profile unchanged.

## Scoring, and what it is not

Scoring checks whether the correct function name appears in the answer. That is
**weaker than BFCL's own AST-based evaluation**, which also checks argument
values. These numbers therefore measure something easier than the BFCL
leaderboard measures and **must not be compared to leaderboard scores**. What
they are valid for is the within-run comparison this task set exists for:
the same scorer applied to both arms, where only tool count differs.
