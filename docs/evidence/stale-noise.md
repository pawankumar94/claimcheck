# M0 — stale false-alarm rate

Does `stale` mean anything? This is a pure-mechanism measurement: no agent, no
network, no API spend. It replays real commit history and counts how often a
ticket raises a flag that a developer would have to dismiss.

Reproduce with `npm run m0`.

## Why this was measured first

A signal that is almost always on is a signal nobody reads. Before asking
whether agents honor tickets, it is worth knowing whether the tickets are
telling the truth — a tool that cries wolf gets uninstalled regardless of how
well the rest of it works.

## Result

660 observations: 12 sampled start commits across this repository's history,
each replayed 30 commits forward, pinned both as a single file and as a
directory.

| Ticket | False-alarm rate before | After | Median commits until red (before) |
|---|---|---|---|
| pinned to a file, with evidence | 65% | **0%** | 9 |
| pinned to a directory, with evidence | 97% | **0%** | **1** |
| pinned with no evidence | 65% | 65% (unchanged, by design) | 9 |

A *false alarm* is an observation where the ticket reported `stale` while its
frozen evidence still held — the files moved, the belief still checked out, and
we raised a flag anyway.

The directory number is the damning one. A ticket pinned to `src/` went red
after a single commit, at the median. Nobody keeps reading a signal like that.

## What changed

Hashing every byte meant any edit under a pinned path outranked the evidence.
Now frozen evidence is the check: if it still holds, the ticket is `supported`
and the churn is reported in `changed` without being an alarm. `stale` is
reserved for the honest case — the files moved and *nothing was frozen* to tell
us whether the belief survived.

Note what this implies: **evidence is no longer optional in practice.** A ticket
pinned without it can only ever be `open` or `stale`, which is the 65% path. If
you pin without evidence you are choosing the noisy mode.

## Proving this is a fix and not a mute

A change that simply deleted the alarm would also score 0% false alarms. So the
harness measures detection too, by injecting real breakages: walk to a commit
two thirds into the replay window, where the file has genuinely churned, delete
the frozen evidence from the real file, and require `contradicted`.

| | Injected breakages caught |
|---|---|
| Current behaviour | **11/11 (100%)** |
| With the alarm deliberately muted (self-test) | **0/11 (0%)** |

The second row is the control. It was produced by temporarily forcing every
evidence-bearing ticket to report `supported`, and it confirms the harness can
tell the two apart. Without that row the 0% false-alarm rate would be
unfalsifiable.

## Limits

- **One repository, and a young one.** 73 commits, purely additive: 23 exported
  identifiers were checked across a 35-commit window and none were removed. So
  the *natural* detection arm — constraints that broke on their own — found no
  cases, and detection rests on injected breakages. Re-run against larger and
  older public repositories before treating 100% as general.
- **Evidence quality is not measured.** Detection here means "the frozen string
  disappeared". A constraint that dies while its evidence string survives — a
  bypass added elsewhere, say — is not caught by this design and would not
  appear in these numbers.
- **The old behaviour is not strictly worse.** `stale` on churn was a prompt to
  look. Removing it trades false alarms for possible false silence. On this
  data that prompt was noise 97% of the time for directory tickets, which is
  why the trade looks right, but it is a trade.

## Data

[`stale-noise.json`](stale-noise.json) holds the per-ticket rows: sampled
commit, target path, evidence token, and the status counts across the replay
window.
