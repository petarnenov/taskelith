# Verification

Date: 2026-10-25. Author verification is recorded below; the independent review follows.

## Scope and source

[G2 work plan](/docs/g2-plan.md) item 20, the second of the five changes the coordinator split it into (20b). The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is Claude Fable 5.1 (medium), as the coordinator assigned.

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

## Review pass 2

- Reviewer: the same invocation, run in the worktree at `357c3d5`, with the pass 1 session named and its resolutions to confirm first.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID: `4db92f70-855c-4fea-84ea-2c0b794a10ff`.
- Snapshot: `99f94aa286be0c282fe685d059fe6a110f26840c8c8af21a3904f1900295d049` before and after; unchanged.
- Pass 1 resolutions: every fix confirmed; M3's rebuttal and the kept or deferred Lows accepted.
- Findings: 0 Critical, 0 High, 1 Medium, 6 Low.

| Finding | Resolution |
| --- | --- |
| M1: the digest depends on the sender's serialization; a rebuilt resend would be a conflict | Fixed: the digest uses sorted keys (test with reordered keys), and design D1 records the obligation on item 21 to republish the stored command unchanged. |
| L1: a test comment stood above the wrong class | Fixed. |
| L2: a default parameter hid the refusing enrollment mode | Fixed: the parameter is required, and the administration tool passes `NO_ENROLLMENT` explicitly. |
| L3: the worker's consumer and publisher log nothing | Deferred to 20d and 20e; recorded in the design's risks. |
| L4: an inventory execution was never checked against the schema | Fixed: the inventory test journals W2 for one offer and checks its `launch-intended` execution. |
| L5: `connectBroker` mixed levels | Fixed: `declareCapacity` extracted. |
| L6: the fresh schema kept migration defaults | Fixed: the defaults remain only in the migration. |

After the pass 2 fixes, `make verify` passed again: 1117 tests, 1117 passed, 0 failed, with every other step as above.

## Review pass 3

- Reviewer: the same invocation, run in the worktree at `6d09482`, with both earlier sessions named and pass 2's resolutions to confirm first.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID: `3fd4825c-d91f-4d21-9b3c-8c1463fb21f1`.
- Snapshot: `473a8288f5460c382c5f915c00630594a02c2009b0e0bf7308e0f1f069749e68` before and after; unchanged.
- Pass 2 resolutions: all seven confirmed.
- Findings: 0 Critical, 0 High, 0 Medium, 5 Low. Under the review process, a Low-only pass is fixed without another review; the fixes below are therefore **not independently reviewed**.

| Finding | Resolution (unreviewed) |
| --- | --- |
| L1: a failed loop skipped closing the broker connection on stop | Fixed: the connection closes once the loops settle, whether they fail or not. |
| L2: the registries' worker order differed by collation | Fixed: PostgreSQL orders by `COLLATE "C"`, as the in-memory registry does. |
| L3: the logged repair failures were untested | Fixed: `repairCommandConsumers` has its own module and unit tests, and the delta has a scenario. |
| L4: the stored declaration compared by the settings' key order | Fixed: the declaration is stored in a fixed field order. |
| L5: the worker's use cases name `@taskelith/nats` types | Kept: `apps/worker` is the composition root, as the control plane's handlers are; the design's wording stands for the journal port. |

After the pass 3 fixes, `make verify` passed: 1119 tests, 1119 passed, 0 failed; coverage 99.26% lines, 91.85% branches, 98.90% functions; every other step as above.

## Merge of `origin/dev` (worker step 9)

The coordinator returned the task because merging `origin/dev` at `21537cd`, which holds item 21b `implement-observation-consumption` (#220), conflicted. The merge commit is `dc4956d`.

- **Conflicts:** only the `@taskelith/nats` imports of `apps/control-plane/src/composition/control-plane.ts` and of `control-plane-api.integration.test.ts`; both sides are kept. The start order is streams and the observation consumer (21b), then the command consumers at enrollment and their repair (20b), then the API and the loops.
- **Interaction found by `make verify`:** 21b's test read the first confirmation of any worker, and 20b's earlier integration test now produces one for another worker first. The test now selects its own worker's confirmation by subject (`fda274f`, then the merge review's L1).
- **Interaction found by the merge review:** 21b's confirmations share the worker's command subject, so 20b's integration test could no longer wait for an exact consumer sequence. It now waits for the three observations, which follow W1 of both offers, and then for an empty consumer.
- `make verify` after the merge and `fda274f`: 1198 tests, 1198 passed, 0 failed; coverage 99.29% lines, 91.82% branches, 98.96% functions; contract compatibility, dependencies, 60 OpenSpec items, archive, and package checks passed.

### Merge review pass 1

- Reviewer: the same invocation, run in the worktree at `fda274f`, asked to review the merge and its interaction only.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID: `fa836dbe-ecba-432f-92da-1c94e6aa8b95`.
- Snapshot: `e0c8dd60481ac973f1b8837bb870d937a0b5324c3ad6e9eecc7eae951aaad9fd` before and after; unchanged.
- Findings: 0 Critical, 1 High, 1 Medium, 1 Low.

| Finding | Resolution |
| --- | --- |
| H1: the intake integration test waited for an exact consumer sequence, which 21b's confirmations change | Fixed as above; the file passed three consecutive runs against the Compose services. |
| M1: no record of the merge | Fixed: this section. |
| L1: the confirmation was matched by a substring of the message | Fixed: it is matched by the outbox row's subject. |

`make verify` after the merge review fixes (`505a83b`): 1198 tests, 1198 passed, 0 failed; coverage 99.29% lines, 91.82% branches, 98.96% functions; every other step passed.

### Merge review pass 2

- Reviewer: the same invocation at `505a83b`, with pass 1's session named and its findings to confirm.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID: `990fcb1b-9658-4d67-be42-f86b06e5b30b`.
- Snapshot: `18d5bbe08253fe6562b551d124637b22159f0493521749931ef87aa0acd333df` before and after; unchanged.
- H1, M1, and L1 confirmed resolved. Findings: 0 Critical, 0 High, 0 Medium, 1 Low.
- L1: the `make verify` result after `505a83b` was not recorded. Fixed by the line above, without another review (Low-only pass).

## Limitations and remaining gates

- No native acceptance on the matrix entries; the tests ran on macOS x86_64 with the Compose services.
- The worker logs nothing yet (20d and 20e), and `dueForPublication` reads the whole outbox (20e).
- Execution facts have no wire mapping until 20c; none is journaled before it.
- Follow-ups: deleting a revoked worker's command consumer; item 21's obligation to republish a stored offer unchanged (design D1); a release note for the journal format change at the promotion to `main`.
- Integration, archive, and the merge into `dev` belong to the coordinator.
