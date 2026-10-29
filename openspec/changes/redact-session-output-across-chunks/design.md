# Design: redact-session-output-across-chunks

## Context

G3 item 13, sub-change 13d (coordinator brief, Niki, 2026-10-29; archived 13b `serve-session-timeline-over-http`, decision 3 and answers Q1, Q6, Q8, and Q9). Scope: output redacted across chunks with a held tail, so that no byte of a secret split across chunks is stored or served; the tail bounded by `MAX_HARNESS_TEXT_LENGTH`; the section 7 amendment; after the answers, the tail sealed at rest under a new key file and the over-bound rule of answer Q1; the `readAgentSessionOutput` route; migration `1792933400000`. Out of scope: credentials revealed to a run (13c, from 12c's delivery record), 13c's worker messages, and the event stream (item 14).

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

A new port `SessionOutputRedactor` in `ports/session-input.ts` (`split(held, chunk, bound)` and `release(held)`) splits a turn's pending output, the held tail followed by the new chunk, unredacted, into a released part, redacted, and a held part. The hold point is the least of:

1. the start of the trailing run of non-whitespace characters (`/\s/`, as `revealed-spans.ts` reads a word), or the end of the text when it ends in whitespace;
2. the start of the first PEM private key begin marker with no end marker after it, as `pemPrivateKeySpans` reads one;
3. the start of the first `.creds` begin marker with no `.creds` end marker after it;
4. the start of the earliest suffix that is a proper prefix of a PEM or `.creds` begin marker, since a marker holds spaces and rule 1 alone would release its first words.

Each point moves back to the start of its run of non-whitespace characters, so the hold point is 0 or follows whitespace. The released part is `redactSecrets(pending.slice(0, hold))`, and the held part `pending.slice(hold)`. At the hold point no match of a session text rule can cross: no whitespace-free shape crosses whitespace, and every block that could still grow is held from its begin marker. So, below the bound, the released parts of a turn joined equal `redactSecrets` of the turn's whole output, which the tests assert. The final release, at the turn's end, is `redactSecrets(held)`. Revealed credentials (13c) add a fifth point, the earliest suffix that is a proper prefix of a revealed value, through the same port; until then the limit of 13b answer Q9 stands.

### 2. Bound (answer Q1)

The held tail never exceeds `MAX_HARNESS_TEXT_LENGTH` (65,536) UTF-16 code units, as the domain counts text (13b answer Q6). Answer Q1 (b) replaces the release "redacted as it stands" of 13b answer Q6: when the held part would pass the bound, it is recorded at once as one `[redacted]` marker and dropped, and a durable flag on the tail (`HeldOutput.continuation`) drops its continuation too, so nothing of a cut secret is released:

- **Run.** A held run of non-whitespace characters (flag `word`) is dropped up to the next whitespace. The tail keeps only the run's last 10 characters, never released, so that a run ending in `-----BEGIN` followed by whitespace turns into a block.
- **Block.** A held part with an open PEM key or `.creds` block, or a begin marker cut after a space (flag `block`), is dropped up to the first PEM or `.creds` end marker; the tail keeps only a suffix that could start an end marker, within the bound. A block whose end never comes is dropped up to its turn's end, which over-redacts but never leaks.

Since no text is cut, no surrogate pair can be split at the bound. The section 7 amendment (decision 6) states the bound and this rule.

### 3. Durable tail and release (questions Q2 and Q3)

- **Where.** The tail is not part of the domain `Session`, so no read and no `SessionView` can reach it by type. `SessionTimelineTransaction` gains `tails: SessionOutputTails` (`get`, `put`, `clear` by session), one tail per session: the session ID, the turn and generation it belongs to, its version, and its ciphertext. PostgreSQL keeps it in `agent_session_output_tails`, one row per session; the in-memory store keeps it in its copied state.
- **At rest (answer Q2).** The tail is stored only sealed: `SealedOutputTails` (`application/sealed-output-tails.ts`) seals the JSON of the held text and its flag, which escapes a lone surrogate so that every string the domain accepts round-trips, through a new port `OutputTailCipher`, with the authenticated data `["session-output-tail", session, turn, version]`; each write takes the next version. The composition passes the 12a `AesGcmSlotCredentialCipher` of `@taskelith/secrets` (AES-256-GCM, a random 96-bit nonce, a 128-bit tag) through `outputTailCipher`, which refuses a key of another size naming only its size; no second cipher is written. A tail that does not open, after a changed byte, turn, or key, fails with `internal` naming only the session. The key is `control-plane/session-output-tail.key`, 32 random bytes in base64, created by `init` through `SessionOutputTailKeyFile.ensure` only when missing, with mode `0600`, never overwritten, also on a rerun; a missing key or one of another size refuses the start without key bytes, as 13b's digest key does. Both key files now share `ControlPlaneKeyFile` of `@taskelith/control-plane-store`.
- **Append.** `appendOutput` checks the chunk's bound before anything (13a requirement "Text bounds checked before redaction"), then the domain's turn checks, extracted from `appendOutput` into `checkOutput` so that a chunk for an unknown or ended turn fails as before and leaves the tail alone. It reads the tail, applies the hold rule and the bound, appends the released text through the domain (decision 4), and writes or clears the tail and replaces the session in one transaction. A chunk that releases nothing still writes the tail, and the `SERIALIZABLE` transaction makes two concurrent appends conflict, the loser retrying on the new tail.
- **Release at the turn's end (answer Q3).** Output entries carry their turn, so a tail belongs to one turn. `#change` applies the change first; when the live turn, the delivered turn of the running generation, is no longer live afterwards (`recordTurnOutcome`, `endGeneration`, `endBoundAttempt`, or any other change through `#change`), the service reads the tail, appends its final release as that turn's output while the turn is still live, clears the tail, and applies the change to that session, all in the change's transaction. `recordTurnAcceptanceUnknown` takes only a queued turn, which holds no output, so it releases nothing. The other service operations (`bindAttempt`, `submitTurn`, `recordRequest`, `consumeResponse`, `answerItem`, `takeHandoff`) end no running turn.
- **Crash.** A crash before a commit leaves the tail and the entries as the previous commit left them. A crash after it leaves the released entries, redacted, and the tail row, sealed and read by no path but the append and the release. After a restart the next chunk, the turn's outcome, or the generation's end that recovery records decides the tail through the same code, so no tail is lost and none is released unredacted. Nothing is held in memory between transactions.

### 4. Entry splitting

The released text, up to the bound plus a chunk plus what redaction adds, can exceed the entry bound of `OutputEntry.text` (65,536). The service splits it into consecutive entries of at most `MAX_HARNESS_TEXT_LENGTH` code units on whole characters, each at its own position, and the window trims as before. This replaces 13a's cut for output only (requirement "Redacted text cut to its bound" modified); a cut would now lose released text.

### 5. Output read

- **Service.** `readOutput(sessionId, after, limit)` reads the session and pages the domain's `readOutputAfter` in one transaction: `{ kind: 'entries', entries, more }` with at most `limit` entries, or `{ kind: 'cursor-expired', earliestRetained }`; a cursor past the last position fails with `invalid`. The 13a requirement "No output read before cross-chunk redaction" is removed.
- **Route.** `readAgentSessionOutput` `GET /projects/{projectId}/agent-sessions/{sessionId}/output`, query `after`, response `OutputRead`, statuses `SESSION_READ`, on both listeners with `browserSession` and `operatorToken`. The server checks `project-viewer` or above, or `installation-owner`, before anything; the handler parses `after` (400 when malformed), checks the session's scope (the one 404 of an unknown or foreign session), takes the stamp, then reads. It maps `entries` to `{ result: 'entries', asOf, position, entries, next }` with `next` the last entry's position while more remain, `cursor-expired` to `{ result: 'cursor-expired', asOf, position, earliestRetained }`, a cursor past the last position to 400, and an unknown session to 404.
- **Pages.** A client follows `next`; when the window trimmed past its cursor between pages, the next read answers `cursor-expired` with the earliest retained position, and the client reads after the position before it (section 9).

### 6. Contract amendments and migration

Wire contracts section 7, "Output across chunks", now holds a turn's output, not a generation's, as one text (answer Q3), states the release before the turn's outcome or its generation's end, the bound with the marker rule of answer Q1, and the tail sealed at rest (answer Q2). The installation contract's control-plane namespace table gains `session-output-tail.key` (answer Q2).

Migration `1792933400000_session-output-tail.sql` (13b answer Q8, renumbered as the last section records): `agent_session_output_tails (session_id text PRIMARY KEY REFERENCES agent_sessions, turn_id text NOT NULL, generation bigint NOT NULL CHECK (generation >= 1), version bigint NOT NULL CHECK (version >= 1), nonce bytea NOT NULL, sealed bytea NOT NULL)`; the down migration drops it and keeps 13a's and 13b's tables. The `postgres-state` delta adds the table requirement.

## Test plan

Every new behavioral test runs failing first against the 13a per-chunk code or a named mutant, recorded in `verification.md`.

- **Every split, every shape** (`packages/adapters/secrets/test/secret-output-redactor.test.ts`). Fixtures for a URL user information, also empty, a PEM key of each marker form (`PRIVATE KEY`, `EC PRIVATE KEY`, `ENCRYPTED PRIVATE KEY`), each issued prefix, a `.creds` block, each NKey seed prefix, and a JWT. For two chunks every offset, and for three every pair of offsets, the stored output equals `redactSecrets` of the whole text; for two chunks it also holds no 4-character substring of the secret. The service with the real adapter is covered over HTTP (a JWT split at every offset) and on PostgreSQL. Fail-before: per-chunk redaction (mutant M1).
- **Bound.** A run held at exactly the bound releases nothing; one unit past it is one marker and its continuation is dropped up to the next whitespace; a JWT across the forced cut leaves no part; a PEM key longer than the bound is one marker up to its end marker; a run ending in `-----BEGIN` drops the block that follows; a block without its end stays dropped.
- **Release** (`packages/modules/execution/test/session-output-tail.test.ts`, in-memory store, stand-in redactor and cipher). The tail released by `recordTurnOutcome`, `endGeneration`, and `endBoundAttempt` as its turn's last entry; a change that keeps the turn running keeps it; a chunk for an ended turn refused with the tail unchanged; a changed ciphertext or authenticated turn fails with `internal`; released text past the entry bound split into entries on whole characters.
- **Restart, crash, and race** (`packages/adapters/postgres/test/session-output-tail.integration.test.ts` and `session-timeline-crash.integration.test.ts`). A chunk that holds half a JWT commits; a service over a new pool shows, through `readOutput` and `readSession`, no part of it, no stored byte of the output or tail tables holds it, and the next chunk records it redacted; a generation ended after a restart releases a lone tail redacted; a ciphertext changed in the database fails with `internal`. A crash at `SessionTimelineCommit.before` leaves no entry and no tail; at `.after`, the entry and the sealed tail. Two concurrent appends that only hold, with a barrier after both read: the output is one serial order.
- **Conformance.** `session-timeline-conformance.ts` gains the tail's byte-for-byte round trip, its replacement, `clear`, and the rollback of both, on both stores; the migration's down test.
- **Keys.** `session-output-tail.key` created owner-only and kept on reruns; a missing or wrong-size key refuses the start with a reason without key bytes; `init` creates it (administration integration test).
- **Pages** (`apps/control-plane/test/agent-session-routes.test.ts`, which already holds the role fixtures, instead of a new file). No entries; 100 entries with `next` and the 101st without; `cursor-expired` with `earliestRetained` after a trim between pages; 400 for a cursor past the last position and malformed ones; the one 404 for an unknown and a foreign session; 401, 403 for a non-member, 200 for a viewer and an owner without a project role. Fail-before: the operation unrouted (mutant M8).

## Size and split

| Area | Source lines | Test lines |
| --- | --- | --- |
| Hold rule, bound, and adapter (`@taskelith/secrets`) | about 190 | about 150 |
| Ports, sealed tails, in-memory store, conformance | about 200 | about 90 |
| Service: append, release, splitting, read | about 90 | about 160 |
| PostgreSQL adapter and migration | about 60 | about 160 |
| Key files, composition, and `init` | about 80 | about 80 |
| Route, handler, and wire mapping | about 30 | about 100 |
| Total | about 650 | about 740 |

With the sealed tail of answer Q2, M-L, which the coordinator accepted without a split.

## Coordinator questions

The answers are recorded under "Coordinator answers" below.

**Q1. Secrets at the forced cut.** Options: (a) as 13b answer Q6 states, release the oldest part redacted as it stands, and state that a secret straddling the cut leaks its released part; (b) record the released part of a run longer than the bound, and its continuation up to the next whitespace, as markers, through a durable flag on the tail, losing such runs' benign text, such as a long minified line. Recommendation: (b): (a) leaks short secrets, not only those longer than the bound, and runs past 65,536 characters without whitespace are rare in agent output. Contract amendment: yes, section 7 (decision 6).

**Q2. Tail at rest.** The tail is the only unredacted session text the control plane stores. Options: (a) plaintext JSON in its own table, read only by the append and release paths and deleted at release, as section 7 states; (b) sealed with AES-256-GCM under a new key file, which changes the installation contract and bootstrap (about 250 more lines, M-L); (c) in memory only, recording a marker for a tail lost at a restart, which section 7 forbids ("no tail is lost"). Recommendation: (a), with (b) as a follow-up if the owner wants session text never at rest. Contract amendment: no for (a), yes for (b) or (c).

**Q3. Tail per turn.** Section 7 holds a generation's output as one text until the generation ends, but entries carry their turn. Options: (a) a tail per turn, released before the turn's outcome and at the generation's end; (b) one tail per generation, its released text attributed to the turn whose chunk released it. Recommendation: (a): every entry keeps its own turn, and a turn's output is complete when its outcome is shown. Contract amendment: yes, section 7 (decision 6).

**Q4. Entries split instead of cut.** Options: (a) split released text past the entry bound into several entries (decision 4), modifying 13a's "Redacted text cut to its bound" for output; (b) keep the cut, losing released text. Recommendation: (a). Contract amendment: no; the entry bound stays.

## Coordinator answers

The coordinator's answers (architect, Niki, 2026-10-29), recorded verbatim:

> Q1 (b): the over-bound word and its continuation become markers through a durable flag; nothing of a cut secret is released. Amend the contract (this replaces the "released redacted beyond the bound" leak case of my 13b Q6 answer).
>
> Q2 (b) in this change, not a follow-up: no possibly-secret text at rest in plaintext. Encrypt the tail with AES-256-GCM (AAD: session, turn, tail version) using a new key file `session-output-tail.key`, created by init only when missing at 0600, exactly like 13b's digest key (missing/wrong-size refuses the start without key bytes); reuse the 12a cipher in the secrets adapter rather than a second implementation. Size becomes M-L, accepted; no split. Contract amendment for the key in the installation contract.
>
> Q3 Per turn, accepted, with the section 7 amendment.
>
> Q4 Split, accepted.
>
> Proceed to code.

## Migration renumber

Architect decision (Niki, 2026-10-29): the migration moves from
`1792933200000` (13b answer Q8) to `1792933400000`. 12c landed on `dev` as
#414 with `1792933300000_slot-credential-deliveries.sql`, migrations must
stay ascending in merge order, and `1792933500000` onward belongs to 12d.
