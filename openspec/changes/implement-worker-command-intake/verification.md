# Verification

Date: 2026-10-25. Author verification is recorded below; the independent review follows.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, the second of the five changes the coordinator split it into (20b). The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is Claude Fable 5.1 (medium), as the coordinator assigned.

- Base revision: `4968758` on `dev`.
- Scope: command intake, the W1 commit before the broker acknowledgement, item 12's obligation to handle each command whatever arrived before it, the slot and ceiling refusals, `worker.capacity.declared`, the outbox publication loop, confirmations, the inventory answer, and R05 for the worker's inbox and outbox boundaries.
- Coordinator decision of the brief: the `EnrollmentRequest` description in `execution.openapi.json` is corrected as a description-only change (20a pass 1, L4).
- Recorded decision left untouched: delivery of rotated worker credentials is G3 item 26 (#212).
- Out of scope: 20c to 20e, as the design's Non-Goals list.
- Coordinator decision on review pass 1, H1 (2026-10-25): option (a). Enrollment ensures the worker's command consumer before it uses the token, a failure answers 503 and leaves the token unused, and a control-plane start ensures the consumer of every enrolled, non-revoked worker. Deleting the consumer on revocation is a follow-up outside this change. The coordinator accepted a possible conflict with item 21b in `apps/control-plane`; whoever hands off second merges `dev` under worker step 9.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of `make verify` (NATS in operator mode with TLS, PostgreSQL 18.6, Toxiproxy).
- Dependencies: no third-party package added. `apps/worker` gains the workspace dependencies `@taskelith/scheduling` (the per-attempt ceiling) and `@taskelith/sdlc` (the generation parsers); the regenerated inventory differs only by these.
- Contracts: `execution.openapi.json` changes one description only; `make contract-compatibility` reports 0 breaking changes for all four documents, so its version stays 0.3.1. The 503 of `enrollWorker` was already declared.
- Journal: format 2 with a migration from format 1; `docs/worker-journal-qualification.md` records it.

## Author self-check

- **Section 3 order:** the reader validates `VersionedCommand`, the window, and then the command schema; the intake rejects an unsupported version and another `workerId` with `execution.command.rejected` and records no intent (`command-intake.test.ts`). A body that fails `VersionedCommand` or its own schema is quarantined by the reader.
- **W1 before the acknowledgement:** a failure at `W1.before` records nothing and the redelivery is recorded once; a crash at `W1.after` makes the redelivery a duplicate; a reused `commandId` with other content fails, so the command is redelivered and, after `max_deliver`, quarantined by item 12's keeper. The end-to-end test against the real broker and control plane checks that both commands are acknowledged only after the journal holds them and that their observations arrive (`control-plane-api.integration.test.ts`).
- **Any order (item 12's obligation):** an end before its offer, a cancellation before its offer, and a second end.
- **Refusals:** each of the four reasons, with `retryable` false, against the schema.
- **Capacity:** one declaration per change, published on the worker's observation subject; two workers' declarations get different identities.
- **Publication, confirmation, inventory:** order and identity, a failed round, confirmations of another journal or beyond the assigned sequence, and a two-part inventory of 300 assignments against `InventoryReported`.
- **Consumer at enrollment:** the fleet test refuses enrollment while the consumer cannot be created and leaves the token usable; the integration tests enroll a worker that then reads its commands without a manually created consumer, and a restart recreates a deleted consumer.
- **Against ADR 0004:** hexagonal: the consumer is a Fleet port with a NATS adapter, and the worker's use case depends on the journal port and a publish function; contract-first: every published message is checked against `execution.asyncapi.json` in the tests; Clean Code: the two publication loops share `runPublicationLoop`.
- **Release notes:** the journal format change is recorded here and in the qualification record. The commit type is `chore`, as for 20a, so the promotion to `main` must mention the format change (review pass 1, L7).

## Checks

`make verify` ran in the worktree with every file tracked, after the pass 1 fixes: exit 0.

- `verify:comments`: no violation.
- `make test` (with its own PostgreSQL, NATS, and Toxiproxy): 1116 tests, 1116 passed, 0 failed; coverage of all files 99.24% lines, 91.82% branches, 98.85% functions, above the 75% floor.
- `make contract-compatibility`: 0 breaking changes in each of the four documents.
- `verify:dependencies`: the inventory is current after `make dependency-inventory`.
- `openspec validate --all --strict`: 58 passed, 0 failed; `verify:archive`: every active change archives into strictly valid specs; `verify:package`: passed.

Before pass 1, `make verify` had failed once on an integration test: two workers' capacity declarations had the same `observationId`, and the broker deduplicated the second. The identity now includes the `journalId` (design D5).

## Review pass 1

- Reviewer: Claude Code, `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run in the worktree at `0fdfc8f`; prompt and output outside the worktree.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID: `661d5dc2-a67e-4a8c-a896-515ee40205fa`.
- Snapshot: `09f27b484cff454c3643e012a31b285658d0772c9d0402f095d001305e96838d` before and after; unchanged.
- Findings: 0 Critical, 1 High, 4 Medium, 7 Low.

| Finding | Resolution |
| --- | --- |
| H1: nothing in production creates the worker's command consumer | Fixed by the coordinator's decision (a): design D7, the `installation-enrollment` delta, and the tests above. |
| M1: `verification.md` lacked the author verification | Fixed: this record. |
| M2: the "commit fails" scenario was tested with a crash after the commit | Fixed: a `W1.before` test, and the `W1.after` test renamed. |
| M3: a permanent `conflict` is redelivered without end and blocks the consumer | Not a defect: the consumer naks with backoff, later commands pass meanwhile (item 12's design), and after `max_deliver` the broker's advisory quarantines it. A test now shows that the conflict is not acknowledged and a later command is journaled. |
| M4: the intent was built with a cast and dropped the offer's `recoveryEpoch` | Fixed: typed parsers, and the intent keeps `recoveryEpoch` in format 2. |
| L1: an offer of an ended assignment can be refused | Kept: D2 admits it like any offer; acceptance and refusal are both safe for an assignment the control plane already ended. |
| L2: the two publication loops duplicate each other | Fixed: `runPublicationLoop` in `@taskelith/nats`. |
| L3: `inbox.kind` holds the wire type for a rejected command | Kept: a rejected command may be of a type this build does not know, so its wire type is the only faithful name. |
| L4: a reordered control list declares new capacity | Fixed: the controls are sorted. |
| L5: `dueForPublication` reads the whole outbox | Deferred to 20e with the backlog limit; recorded in the design's risks. |
| L6: `controls` and `enforceableControls` name one concept | Kept: Fleet's name predates this change, and the declaration follows the wire schema's name. |
| L7: the format change has no release note under `chore` | Recorded above for the promotion to `main`. |
