# Design: redact-session-output-across-chunks

## Context

G3 item 13, sub-change 13d (coordinator brief, Niki, 2026-10-29; archived 13b `serve-session-timeline-over-http`, decision 3 and answers Q1, Q6, Q8, and Q9). Scope: output redacted across chunks with a held tail, so that no byte of a secret split across chunks is stored or served; the tail bounded by `MAX_HARNESS_TEXT_LENGTH` and released redacted past it; the section 7 amendment; the `readAgentSessionOutput` route; migration `1792933200000`. Out of scope: credentials revealed to a run (13c, from 12c's delivery record), 13c's worker messages, and the event stream (item 14).

What the study found at `3009329f`:

- **Contract.** Wire contracts section 7, "Output across chunks", already requires a generation's output to be redacted as one text with a held tail "kept durably with the generation, never shown", decided after a restart by the next chunk or the generation's end, "also one that recovery records". It states no bound; 13b answer Q6 adds it here. Section 9, "Output", maps `readAgentSessionOutput` onto `readOutputAfter` with pages of 100 and `cursor-expired` with the earliest retained position; `control-plane.openapi.json` already has the operation (`GET /projects/{projectId}/agent-sessions/{sessionId}/output`, `OutputRead`), and `access-requirements.ts` already maps it to `PROJECT_READ`.
- **Service.** `SessionTimelineService.appendOutput` (`application/session-timeline-service.ts`) redacts each chunk alone through `SessionTextRedactor` and cuts it to `MAX_HARNESS_TEXT_LENGTH`; `SessionView` hides the output entries, and the service has no output read (13a answer Q5). The domain's `readOutputAfter` (`domain/session-output.ts`) returns every retained entry after a cursor, unpaged.
- **Redaction.** `redactSecrets` of `@taskelith/secrets` (`scrub.ts`) applies `redactUrlUserinfoEvenEmpty` and `SECRET_SHAPE_RULES` of `@taskelith/observability` (`redaction-rules.ts`): PEM private keys, issued secrets (`tkop_`, `tken_`, `tkwk_`), `.creds` blocks, NKey seeds, and JWTs, after the spans of revealed values. The rules are `String.replace` functions that report no position. Every shape except a PEM key and a `.creds` block holds no whitespace; those two are bounded by begin and end markers, which themselves hold spaces.
- **Storage.** `PostgresSessionTimelineStore` runs each transaction `SERIALIZABLE` with retries; the session record has no output entries, which live one row each in `agent_session_output` (13a answer Q2). `SessionTimelineCommit.before` and `.after` crash points surround each timeline commit. The in-memory store runs one transaction at a time over a copy.
- **Routes.** `routes.ts` leaves `readAgentSessionOutput` unrouted with a comment naming 13d; `AgentSessionApi.#scopedRead` gives a foreign session the 404 of an unknown one, and `parseTimelineCursor` parses `after`.

## Goals and non-goals

Goals: decisions 1 to 6. Non-goals: revealed credentials in the hold (decision 1 names the hook 13c fills), the `output-appended` event (item 14, which must emit only released entries), duplicate chunks after a crash before a commit (13c's observation sequence), and any wire schema change.

## Decisions

### 1. Hold rule (adapter `SecretOutputRedactor` of `@taskelith/secrets`)

A new port `SessionOutputRedactor` in `ports/session-input.ts` splits a turn's pending output, the held tail followed by the new chunk, unredacted, into a released part, redacted, and a held part. The hold point is the least of:

1. the start of the trailing run of non-whitespace characters (`/\s/`, as `revealed-spans.ts` reads a word), or the end of the text when it ends in whitespace;
2. the start of the first PEM private key begin marker with no end marker after it, as `pemPrivateKeySpans` reads one;
3. the start of the first `.creds` begin marker with no `.creds` end marker after it;
4. the start of the earliest suffix that is a proper prefix of a PEM or `.creds` begin marker, since a marker holds spaces and rule 1 alone would release its first words.

Each point moves back to the start of its run of non-whitespace characters, so the hold point is 0 or follows whitespace. The released part is `redactSecrets(pending.slice(0, hold))`, and the held part `pending.slice(hold)`. At the hold point no match of a session text rule can cross: no whitespace-free shape crosses whitespace, and every block that could still grow is held from its begin marker. So, below the bound, the released parts of a turn joined equal `redactSecrets` of the turn's whole output, which the tests assert. The final release, at the turn's end, is `redactSecrets(held)`. Revealed credentials (13c) add a fifth point, the earliest suffix that is a proper prefix of a revealed value, through the same port; until then the limit of 13b answer Q9 stands.

### 2. Bound (question Q1)

The held tail never exceeds `MAX_HARNESS_TEXT_LENGTH` (65,536) UTF-16 code units, as the domain counts text (13b answer Q6). When the held part would be longer, the oldest code units beyond the bound are released, never splitting a surrogate pair (one more unit is released instead). As Q6 accepted, they are redacted as they stand. A secret that straddles that forced cut then leaks its released part, also a short one inside a whitespace-free run longer than the bound, such as a JWT inside a long minified line. Question Q1 asks whether to close that: the forced release records the released part of the run as one `[redacted]` marker, and a durable flag on the tail makes the run's continuation, up to the next whitespace, one marker too. A PEM key or `.creds` block longer than the bound keeps the limit Q6 accepted: its continuation after a forced release is no longer known to be one. The section 7 amendment (decision 6) states the bound and the chosen rule.

### 3. Durable tail and release (questions Q2 and Q3)

- **Where.** The tail is not part of the domain `Session`, so no read and no `SessionView` can reach it by type. `SessionTimelineTransaction` gains `tails: SessionOutputTails` (`get`, `put`, `clear` by session), one tail per session: the session ID, the turn and generation it belongs to, the held text, and the flag of decision 2. PostgreSQL keeps it in `agent_session_output_tails`, one row per session, `record` as JSON text so that every string the domain accepts round-trips; the in-memory store keeps it in its copied state. Question Q2 asks about the tail at rest.
- **Append.** `appendOutput` checks the chunk's bound before anything (13a requirement "Text bounds checked before redaction"), then the domain's turn checks, extracted from `appendOutput` into `checkOutput` so that a chunk for an unknown or ended turn fails as before and leaves the tail alone. It reads the tail, applies the hold rule and the bound, appends the released text through the domain (decision 4), and writes or clears the tail and replaces the session in one transaction. A chunk that releases nothing still writes the tail, and the `SERIALIZABLE` transaction makes two concurrent appends conflict, the loser retrying on the new tail.
- **Release at the turn's end.** Output entries carry their turn, so a tail belongs to one turn (question Q3). Before any change, `#change` applies it to a copy; when the tail's turn is no longer live afterwards (`recordTurnOutcome`, `recordTurnAcceptanceUnknown`, `endGeneration`, `endBoundAttempt`, or any later operation that ends it), the service first appends the final release while the turn is still live, then applies the change, and clears the tail, all in that change's transaction.
- **Crash.** A crash before a commit leaves the tail and the entries as the previous commit left them. A crash after it leaves the released entries, redacted, and the tail row, unredacted and read by no path but the append and the release. After a restart the next chunk, the turn's outcome, or the generation's end that recovery records decides the tail through the same code, so no tail is lost and none is released unredacted. Nothing is held in memory between transactions.

### 4. Entry splitting

The released text, up to the bound plus a chunk plus what redaction adds, can exceed the entry bound of `OutputEntry.text` (65,536). The service splits it into consecutive entries of at most `MAX_HARNESS_TEXT_LENGTH` code units on whole characters, each at its own position, and the window trims as before. This replaces 13a's cut for output only (requirement "Redacted text cut to its bound" modified); a cut would now lose released text.

### 5. Output read

- **Service.** `readOutput(sessionId, after, limit)` reads the session and pages the domain's `readOutputAfter` in one transaction: `{ kind: 'entries', entries, more }` with at most `limit` entries, or `{ kind: 'cursor-expired', earliestRetained }`; a cursor past the last position fails with `invalid`. The 13a requirement "No output read before cross-chunk redaction" is removed.
- **Route.** `readAgentSessionOutput` `GET /projects/{projectId}/agent-sessions/{sessionId}/output`, query `after`, response `OutputRead`, statuses `SESSION_READ`, on both listeners with `browserSession` and `operatorToken`. The server checks `project-viewer` or above, or `installation-owner`, before anything; the handler parses `after` (400 when malformed), checks the session's scope (the one 404 of an unknown or foreign session), takes the stamp, then reads. It maps `entries` to `{ result: 'entries', asOf, position, entries, next }` with `next` the last entry's position while more remain, `cursor-expired` to `{ result: 'cursor-expired', asOf, position, earliestRetained }`, a cursor past the last position to 400, and an unknown session to 404.
- **Pages.** A client follows `next`; when the window trimmed past its cursor between pages, the next read answers `cursor-expired` with the earliest retained position, and the client reads after the position before it (section 9).

### 6. Contract amendment and migration

Wire contracts section 7, "Output across chunks", gains (text subject to Q1 and Q3):

> The held tail belongs to its turn and is released, redacted, before the turn's outcome or its generation's end is recorded. It never exceeds `MAX_HARNESS_TEXT_LENGTH`, 65,536 code units: past the bound the oldest part is released, and a run of non-whitespace characters longer than the bound is recorded as markers, the part released and its continuation up to the next whitespace. A PEM key or `.creds` block longer than the bound can show its continuation after the released part.

Migration `1792933200000_session-output-tail.sql` (13b answer Q8): `agent_session_output_tails (session_id text PRIMARY KEY REFERENCES agent_sessions, turn_id text NOT NULL, generation bigint NOT NULL CHECK (generation >= 1), record text NOT NULL)`; the down migration drops it and keeps 13a's and 13b's tables. The `postgres-state` delta adds the table requirement.

## Test plan

Every new behavioral test runs failing first against the 13a per-chunk code or a named mutant, recorded in `verification.md`.

- **Every split, every shape** (`packages/adapters/secrets/test/secret-output-redactor.test.ts`, and the service with the in-memory store in `packages/modules/execution/test/session-output-tail.test.ts`). Fixtures `before <secret> after` for a URL user information, also empty, a PEM key of each marker form (`PRIVATE KEY`, `EC PRIVATE KEY`, `ENCRYPTED PRIVATE KEY`), each issued prefix, a `.creds` block, each NKey seed prefix, and a JWT. For two chunks every offset, and for three every pair of offsets, the joined stored output equals `redactSecrets` of the whole text and holds no substring of the secret of 4 or more characters. Fail-before: 13a's per-chunk redaction leaks at the first split inside each secret.
- **Bound.** Held tail at exactly the bound (nothing forced) and one unit past it (the oldest unit released); a surrogate pair at the forced cut; a JWT straddling the forced cut in a run longer than the bound (Q1); a PEM key longer than the bound.
- **Release.** The tail released by `recordTurnOutcome`, `recordTurnAcceptanceUnknown`, `endGeneration`, and `endBoundAttempt`, attributed to its turn; a chunk for an ended turn refused with the tail unchanged; released text past the entry bound split into entries on whole characters.
- **Crash** (`packages/adapters/postgres/test/session-output-tail.integration.test.ts`). A chunk that holds half a secret commits; a new service over the same database then shows, through `readOutput`, `readSession`, and `readCardSessions`, no part of it, and the tail row holds it; the next chunk records it redacted; a generation ended through recovery releases a lone tail redacted. A crash at `SessionTimelineCommit.before` leaves tail and entries as before; at `.after`, the committed state. Two concurrent appends with a barrier inside both transactions: one retries, and the output equals the serial result.
- **Conformance.** `session-timeline-conformance.ts` gains the tail round-trip of every string the domain accepts, `clear`, and its rollback, on both stores; the migration's down test.
- **Pages** (`apps/control-plane/test/agent-session-output.test.ts`). 0, 100, and 101 entries with `next`; `cursor-expired` with `earliestRetained` after a trim between pages; 400 for a cursor past the last position and a malformed one; 404 for an unknown and a foreign session with one body; 401, 403 for a non-member, 200 for a viewer and an owner without a project role. Fail-before: each answered 404 while unrouted, so each test asserts the served body, not the status alone.

## Size and split

| Area | Source lines | Test lines |
| --- | --- | --- |
| Hold rule and adapter (`@taskelith/secrets`) | about 120 | about 250 |
| Port, tail store port, in-memory store, conformance | about 90 | about 80 |
| Service: append, release, splitting, read | about 140 | about 300 |
| PostgreSQL adapter and migration | about 70 | about 200 |
| Route, handler, and wire mapping | about 60 | about 200 |
| Total | about 480 | about 1,030 |

About 1,500 lines with the contract and spec text: within M. No split.

## Coordinator questions

The deltas follow the recommendations below until the answers are recorded.

**Q1. Secrets at the forced cut.** Options: (a) as 13b answer Q6 states, release the oldest part redacted as it stands, and state that a secret straddling the cut leaks its released part; (b) record the released part of a run longer than the bound, and its continuation up to the next whitespace, as markers, through a durable flag on the tail, losing such runs' benign text, such as a long minified line. Recommendation: (b): (a) leaks short secrets, not only those longer than the bound, and runs past 65,536 characters without whitespace are rare in agent output. Contract amendment: yes, section 7 (decision 6).

**Q2. Tail at rest.** The tail is the only unredacted session text the control plane stores. Options: (a) plaintext JSON in its own table, read only by the append and release paths and deleted at release, as section 7 states; (b) sealed with AES-256-GCM under a new key file, which changes the installation contract and bootstrap (about 250 more lines, M-L); (c) in memory only, recording a marker for a tail lost at a restart, which section 7 forbids ("no tail is lost"). Recommendation: (a), with (b) as a follow-up if the owner wants session text never at rest. Contract amendment: no for (a), yes for (b) or (c).

**Q3. Tail per turn.** Section 7 holds a generation's output as one text until the generation ends, but entries carry their turn. Options: (a) a tail per turn, released before the turn's outcome and at the generation's end; (b) one tail per generation, its released text attributed to the turn whose chunk released it. Recommendation: (a): every entry keeps its own turn, and a turn's output is complete when its outcome is shown. Contract amendment: yes, section 7 (decision 6).

**Q4. Entries split instead of cut.** Options: (a) split released text past the entry bound into several entries (decision 4), modifying 13a's "Redacted text cut to its bound" for output; (b) keep the cut, losing released text. Recommendation: (a). Contract amendment: no; the entry bound stays.
