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

4. **Stale is not contradicted.** A hash change means the file moved; it does
   not by itself mean the assertion is false. Re-read the file, then re-pin
   or close the ticket.

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
```

MCP: `pin_claim`, `list_claims_for_file`, `check_claim`.

Config A/B (`diedinchat measure`) is the lab for when the claim itself is
“this setup is better.” Freeze keys, repeat trials, report the interval,
never call “not distinguishable” a win. Underpowered is not equivalent.

<!-- diedinchat:end -->
