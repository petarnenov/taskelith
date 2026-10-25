## Scope and source

Change `record-session-harness-pinning`, assigned by the coordinator on 2026-10-25 with Codex CLI (`gpt-6.1-sol`, medium effort, read-only) as the reviewer by rotation. Source: the owner's decision of 2026-10-25 in the project conversation, given in Bulgarian and paraphrased here: to avoid the "rotating accounts" problem the terms reviews found, a session keeps the harness and the subscription slot it started with until its work is finished and the session and its agent are closed; neither is switched during the session; pinning across a whole task is rejected, and a new session of the same task may get a different harness or slot by the normal selection. Scope: ADR 0005 decision 5 and status, G3 plan items 5, 12, and 18, "Consequences for D15" in the Codex and Claude Code qualification records, and the `harness-account-pools` "Session affinity" requirement. Excluded: code, and any change to D15, which the owner decided as (a).

## Revision and environment

Branch `record-session-harness-pinning` from `origin/dev` at `d99423c`. macOS x86_64, Node.js through nvm, OpenSpec through `npm run openspec`.

## Author self-check and evidence check

- The ADR amendment keeps the existing rule for an unavailable slot and adds the harness, the duration, and the per-session scope; no other ADR 0005 decision changed.
- The plan clauses are one clause each and do not restate the ADR; item 13 is unchanged because it chooses neither harness nor slot.
- The qualification sentences state what the rule does and add no legal conclusion; no quote was added or changed.
- `git diff origin/dev...HEAD` touches only Markdown under `docs/` and this change.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate record-session-harness-pinning --strict` | Passed before review |
| `make verify` | Pending |

## Review

Pending.

## Limitations

Documentation only; nothing is implemented.

## Remaining gates

Independent review, handoff, integration, and archive.
