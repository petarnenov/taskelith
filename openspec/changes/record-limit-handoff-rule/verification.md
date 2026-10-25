## Scope and source

Change `record-limit-handoff-rule`, assigned by the coordinator on 2026-10-25 with Codex CLI (`gpt-6.1-sol`, medium effort, read-only) as the reviewer. Source: the owner's clarification of 2026-10-25 in the project conversation, given in Bulgarian and paraphrased here: when a session's subscription hits a usage or rate limit, the session writes a handoff and stops, and the work continues in a new session that reads the handoff; the new session goes only to a different harness, because the same harness on another subscription after a limit is the clearest case of "rotating accounts"; if no other harness is eligible, the task waits for the cooldown. Scope: ADR 0005 decisions 4 and 5 and status, G3 plan items 4, 12, and 18, "Consequences for D15" in the Codex and Claude Code qualification records, and the `harness-account-pools` "Session affinity" requirement. Excluded: code, and any change to D15, which the owner decided as (a).

## Revision and environment

Branch `record-limit-handoff-rule` from `origin/dev` at `ba24952`. macOS x86_64, Node.js through nvm, OpenSpec through `npm run openspec`.

## Author self-check and evidence check

- The ADR amendment adds the limit rule to decision 4 and limits decision 5's general rule for an unavailable slot to causes other than a limit; no other decision changed.
- "Waits for the cooldown" is read as waiting for the limited slot and continuing on it (`design.md`, "After the wait"); this reading is the author's and is reported to the coordinator.
- The plan clauses are one clause each; item 13 is unchanged because it implements item 4.
- The qualification sentences state what the rule does and add no legal conclusion; no quote was added or changed.
- `git diff origin/dev...HEAD` touches only Markdown under `docs/` and this change.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate record-limit-handoff-rule --strict` | Passed before review |
| `make verify` | Pending |

## Review

Pending.

## Limitations

Documentation only; nothing is implemented. The handoff's format is left to G3 items 4 and 18.

## Remaining gates

`make verify` on the final head, independent review, handoff, integration, and archive.
