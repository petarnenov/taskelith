# Verification: define-board-session-and-event-stream-contracts

Status: developed and verified by the author; independent review pending (passes 1 and 2, and pass 3 if governance "Conditional third pass" requires it); not archived.

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9b, size L, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent. Contract-first only: the board, task detail, inbox, agent session, and event stream operations in `control-plane.openapi.json`, their generated types, contract tests, the contract pages, and the spec deltas; the item 4 follow-ups (the `delivery-acknowledgement` inbox item kind in the product ports contract and `NEEDS_YOU_KINDS`, and commit-before-display as a wire rule); and the correction of `docs/contracts/session-timeline.md:140` at `ff7ab7a0`. No adapter and no handler (items 13 to 15).
- The architect's decisions of 2026-10-28 for item 9, as the brief gives them: browser operations in the control-plane document, 9a's schemes and failures reused, and the SSE stream as an OpenAPI `text/event-stream` operation with a discriminated union of event schemas.
- Sources: the [session timeline contract](/docs/contracts/session-timeline.md), the `session-turn-model` specification, the [product ports contract](/docs/contracts/product-ports.md), the `execution-observability` specification, [architecture](/docs/architecture.md) sections 7 and 11 and R14, the [trust model](/docs/trust-model.md) section 3, [ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6, [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5, and G3 plan rows 9 and 13 to 15. Where the sources are silent, [design](design.md) decisions 1 to 21 record the shape chosen and the source it relies on.
- Excluded: `execution.openapi.json` and `execution.asyncapi.json` (9c and 9d), the worker messages and the terminal (9d), delegation results and the reconciliation queue operations (9c), and the durable snapshot of output older than the retained window (item 14).

## Revision

- Base: `dev` `ff7ab7a0`.
- `94a93f73` `chore: define the board, session, and event stream contracts` (document, `NEEDS_YOU_KINDS` and `NeedsYouAnswer`, contract and product ports tests, contract pages).
- `bf681fe0` `docs: open the define board session and event stream contracts change` (proposal, design, tasks, spec deltas, `checklist.json`, empty `findings.jsonl` and `passes.jsonl`).
- `d1ff822e` `docs: route the define board session and event stream contracts change` (`route.json`, unedited). The `make verify` run below checked this commit's tree.
- The commit that adds this record changes only this file and `tasks.md`; it is the head that review pass 1 reviews.

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js and npm from `.nvmrc` through the pinned toolchain of `make`; Docker for the `make test` services.

## Author self-check

- **Scope.** 17 operations added, 51 in the document: for a project `readBoard`, `readTaskDetail`, `readInbox`, `readInboxCounts`, `answerInboxItem`, `listAgentSessions`, `readAgentSession`, `listAgentSessionTurns`, `submitTurn`, `listAgentSessionRequests`, `respondToNativeRequest`, `readAgentSessionOutput`, and `streamProjectEvents`; for the installation `readInstallationInbox`, `readInstallationInboxCounts`, `answerInstallationInboxItem`, and `streamInstallationEvents`. `info.version` 0.1.0 to 0.2.0. No 9a path or schema changed (a script compared every path and schema of `ff7ab7a0`'s document with the new one, deep-equal); no other document changed, so `execution.openapi.json` stays 0.5.0 and `execution.asyncapi.json` 0.7.0.
- **Shared vocabulary.** `AttemptOutcome`, `ExitStatus`, and `AdmissionState` are copied from `execution.openapi.json` and `ContentDigest` and `WorkflowRunBinding` from `sdlc.openapi.json`; the shared-vocabulary test of `packages/contracts/test/contracts.test.ts` checks every shared name. No new name collides with a schema of the AsyncAPI documents.
- **Domain vocabularies.** Every wire enumeration of the board, inbox, and session schemas equals its constant of `@taskelith/execution` or `@taskelith/sdlc`, and the text bounds equal `MAX_HARNESS_TEXT_LENGTH` and `MAX_INPUT_ANSWER_BYTES` (tests `the board and inbox enumerations are the product ports vocabularies` and `the session enumerations and bounds are the session timeline vocabularies`).
- **9a rules over the new operations.** The 9a tests run over every operation and pass: every mutation requires the CSRF header with the cookie or the bearer alone, every path parameter answers 400, no response reaches a `writeOnly` schema, and 401 and 403 use their fixed schemas. The paging test now checks the key of each list (identifier or position), and a new test checks that the snapshot reads are unpaged and stamped.
- **Item 4 follow-ups.** `delivery-acknowledgement` is in `NEEDS_YOU_KINDS`, `NeedsYouAnswer`, product ports section 4.1, the `product-ports` delta, and the wire `InboxItemKind` and `InboxAnswer`; `docs/contracts/session-timeline.md` section 5.5 and section 10 now say that item 9 added the kind and item 13 opens the items. Commit-before-display is the `control-plane-wire-contracts` requirement "Event position after commit" and the contract page section 10.
- **Citations.** `docs/contracts/session-timeline.md:140` and `packages/modules/execution/src/ports/needs-you.ts:26` are cited at `ff7ab7a0`; the other citations name sections or symbols, checked against the files at `ff7ab7a0`.
- **Evidence check.** Every result below was copied from the output of the command named beside it, on the commit named in "Revision".

## Checks

| State | Command | Result |
| --- | --- | --- |
| Working tree before the commits | `npm run openspec -- validate define-board-session-and-event-stream-contracts --strict` | `Change 'define-board-session-and-event-stream-contracts' is valid` |
| Same | `npm run verify:links`; `npm run verify:archive`; `npm run verify:comments`; `npm run verify:findings` | Every checked link conforms; every active OpenSpec change archives into strictly valid specs; every comment is within the comment length rule; every findings file is valid: 68 file(s), 48 pass summary files, 3 route files |
| Same, after `npm run build` | `node --experimental-strip-types --test packages/contracts/test/board-session-contracts.test.ts packages/contracts/test/control-plane-contracts.test.ts packages/contracts/test/contracts.test.ts packages/modules/execution/test/product-ports.test.ts` | 72 tests, all passed |
| Same | `tsc` over the three changed test files with the repository's options and `allowImportingTsExtensions` | Exit 0 |
| Same | Spec delta requirement body lengths, in characters | Operation roles 496, Identifiers and pages 438, Board and inbox views 298, Inbox answers on the wire 414, Agent session reads 365, Turn submission on the wire 356, Native request responses on the wire 422, Output after a cursor on the wire 287, Event streams 378, Event position after commit 302, Event stream cursor and resynchronization 392, Slow stream consumers 256, Event payloads and agent text 243, Session schemas shared with the worker messages 402; Needs you items answered once by their source 377, Acknowledgement of an uncertain delivery 368 |
| `bf681fe0` | `make findings ARGS="route --change define-board-session-and-event-stream-contracts"` | Committed unedited as `d1ff822e`: tier `elevated` (triggers `lines`, `contracts`, `size`), rule version 1; recommended pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; the shadow router failed with `missing-credential`, so the rule decided alone |
| `d1ff822e`, clean tree | `make verify` (log `bsec-verify-1.log` in the session scratchpad) | Passed, profile full, tree `4718a0a5`, stamp written: tests 3120, pass 3058, fail 0, skipped 62; all files 99.41% lines, 92.80% branches, 98.99% functions; generated part below |
| This record | `make record CHANGE=define-board-session-and-event-stream-contracts LOG=<log>`; `make record-check CHANGE=define-board-session-and-event-stream-contracts` | Generated part written; `the generated part matches the tree` |

## Limitations

- Contract only: no handler enforces the roles, the single consumption across both answer paths, the event positions, the resynchronization, or the redaction of agent text; items 13 to 15 must, and their tests must check the real SSE frames and `Last-Event-ID` precedence.
- The document has no dedicated OpenAPI linter; its validity rests on the type generator, the ajv compilation of every schema in strict mode, and the contract tests, as for 9a. OpenAPI cannot describe SSE framing; the frame rules are prose in the contract page section 10, and the tests check the event schemas.
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`; under governance "Routed effort" the elevated efforts apply only after a governance change that the owner approves.
- `packages/contracts/breaking-changes.json` and `make contract-breaking-changes` do not exist on `ff7ab7a0`, so the version bump has no entry; if that tooling lands in `dev` before the handoff, the worker merges `dev` and adds the entry.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `4718a0a5186c63609e6698c8318fdf41c87b8b5f`; tests 3120, pass 3058, fail 0, skipped 62; all files 99.41% lines, 92.80% branches, 98.99% functions.
- `npm run openspec -- validate define-board-session-and-event-stream-contracts --strict`: passed, `Change 'define-board-session-and-event-stream-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 68 file(s); every pass summary file is valid: 48 file(s); every route file is valid: 4 file(s).`.
- Spec diff against the merge base `ff7ab7a0622d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending: pass 1 by reviewer A, pass 2 by reviewer B, and pass 3 by reviewer A if governance "Conditional third pass" requires it; the session runs them.

## Remaining gates

- Review passes 1 and 2, and pass 3 if required, with their fixes and records.
- Archive on the branch under worker step 7.
- Integration into dev by the coordinator (single pull request).

## Follow-ups

- Item 13: the session timeline service with the idempotency keys of turns and responses, the redaction of agent text before it is recorded, and the native request source that opens `delivery-acknowledgement` items (contract page sections 7, 8.1, and 9).
- Item 14: positions after the commit in commit order, stream retention, bounded buffers, keep-alive, and ending a stream at logout or a role change (contract page section 10).
- Item 15: the board and inbox handlers (contract page section 8).
- 9d: the worker messages reuse the session schemas of design decision 3 unchanged.
