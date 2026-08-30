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

1. **Pin assertions to files, with evidence.** After you state a constraint
   about the repo, write a ticket. Do not leave it only in the transcript:

   ```
   diedinchat pin --text "Auth only through middleware." \
     --file src/middleware.ts --evidence withAuth
   ```

   `--evidence` is a phrase that must remain in those files for the claim to
   hold — an exported name, a call, a distinctive literal. Repeat the flag for
   several. It is what makes the ticket check itself: with evidence it reports
   `supported` or `contradicted`, and a measured 0% false-alarm rate. Pinned
   without it, a ticket can only ever be `open` or `stale`, and `stale` fires on
   any edit to its paths — 65% of replayed commits, which is noise, not signal.
   Always pass `--evidence` (or `evidence` to `pin_claim`) unless there is
   genuinely no stable phrase to freeze.

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
