# Verification: define-worker-messages-and-terminal-contracts

Status: developed and verified by the author; not yet reviewed.

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9d, size M, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent. Contract-first only: the protocol version 2 messages of `execution.asyncapi.json`, the new `terminal.asyncapi.json`, the terminal and relay upgrades, generated types, contract tests, the contract page, the wording fixes of the refreshed SCM credential, and the spec deltas.
- The architect's decisions of 2026-10-28 as the brief gives them: the terminal upgrade in OpenAPI and its frames, the relay frames included, in `terminal.asyncapi.json`; a refreshed SCM credential as a notice only, fetched with 9c's `fetchRunScmCredential`, with the wording fixes here; protocol versions 1 and 2 accepted and session work only to version 2 workers; the delegation response command here; byte-identical shared names and no path in two documents.
- Where the sources are silent, [design](design.md) decisions 1 to 17 record the minimal shape chosen and the source it relies on; the design's "Open question" names the one question left to the architect.
- Excluded: adapters, handlers, the worker host, the relay server, and any runtime (items 13, 18, 21, 38, 39, and 40); raising `EXECUTION_PROTOCOL_VERSION`.

## Revision

- Created from `dev` `72989e7c` as briefed. Before the first commit, 9c (`extend-execution-http-contracts`, #395) landed in `dev` as `10fc3bbe`, and the branch, still without commits, fast-forwarded to it (design decision 17); `10fc3bbe` is the merge base.
- `56e0ed00` `chore(contracts): define the worker session messages and the terminal contracts` (documents, generator list, exported constant, breaking-change declarations, contract tests, contract pages, G3 plan row 9, source control contract, change record, spec deltas).
- `f86d3a4d` `docs: route the define worker messages and terminal contracts change` (`route.json`, unedited). The first `make verify` run checked this commit's tree and failed in one test (Checks).
- `7cabc322` `test(nats): cover only the protocol version 1 messages in the schema table test` (the NATS adapter test, the contract page section 12 item 13 obligation, design decision 1).
- `33d0ce5a` `docs: drop the route record before routing the changed diff again` and `594471b3` `docs: route the define worker messages and terminal contracts change again` (`route.json`, unedited), because the fix changed the routed diff (worker step 4). The second `make verify` run checked the tree of `594471b3`, `31bcdccafca6942044844b599055631109b7404b`.
- The commit after it adds this record and ticks task 4.1.

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js v24.22.1 from `.nvmrc` through the `make` targets; Docker for `make test` and `make contract-breaking-changes`.

## Author self-check

- **Scope.** `execution.asyncapi.json` 0.7.0 to 0.8.0 with 4 commands and 11 observations of protocol version 2; `terminal.asyncapi.json` 0.1.0 with 7 browser frames and 8 relay frames; `control-plane.openapi.json` 0.2.0 to 0.3.0 with `openTerminal` and `TerminalRefusal`; `execution.openapi.json` 0.6.0 to 0.7.0 with `openWorkerRelay` and `RelayRefusal`; `SESSION_PROTOCOL_VERSION` exported; `EXECUTION_PROTOCOL_VERSION` unchanged at 1 (design decision 1).
- **Shared vocabulary.** The messages copy 19 schemas of the control-plane and execution documents, and the terminal document 5, from those documents by a script, so they are byte-identical; the generator, which refuses one name with two definitions, generated the bundle, and `a schema name means the same schema in every document that defines it` now also covers `terminal.asyncapi.json` and names seven 9d shared schemas that it must find. The 9b test `the schemas that the worker messages reuse use only keywords that draft-07 reads alike` covers the reused session schemas.
- **No path in two documents.** The terminal channels have `address: null` (design decision 13); `openTerminal` is only in the control-plane document and `openWorkerRelay` only in the execution document, which the generator's `mergeOpenapi` checks.
- **Breaking changes.** `make contract-breaking-changes` against `10fc3bbe` printed 80 changes for `execution.asyncapi.json` 0.8.0, all additions (15 messages, 50 schemas, 15 operation message entries), and none for the other documents; the entry is in `packages/contracts/breaking-changes.json` with its reason, and `make contract-compatibility` then reported `Contract documents have no undeclared breaking change.` No semantic narrowing hides from the check: no existing operation or message changed its meaning (design decision 15).
- **Redaction.** No message reaches a secret schema and no document holds an example, which tests check; the notice's payload has exactly `protocolVersion`, `runId`, `credentialId`, and `version`. The redaction rule is named in the contract page section 10.
- **Error answers.** `openTerminal` answers 101, 400, 401, 403 (`role-required` or `csrf-token-invalid`), 404, 422 (`attempt-not-current`, `terminal-not-offered`), 500, and 503; `openWorkerRelay` 101, 400, 401, 422 (`protocol-not-supported`), 500, and 503; every close has a code and a `TerminalCloseReason`; every worker refusal a `TerminalRefusalReason`.
- **Fail-before.** See [design](design.md) "Fail-before": before the implementation the two new files failed to load, then 14 of 64 tests failed with the export in place; after it, 125 of 125 tests of the contract package and the generator passed.
- **Citations.** Sections and symbols were checked against the files at `10fc3bbe`; the architecture's relay is in section 8, the anchor `#8-deployment-and-data-ownership`.
- **Evidence check.** Every result below was copied from the output of the command named beside it, on the state named beside it.

## Checks

| State | Command | Result |
| --- | --- | --- |
| Working tree before `56e0ed00` | `npm run openspec -- validate define-worker-messages-and-terminal-contracts --strict` | `Change 'define-worker-messages-and-terminal-contracts' is valid` |
| Same | `npm run verify:links`; `npm run verify:comments`; `npm run verify:findings`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Every checked link conforms; every comment is within the rule; every findings file is valid: 72 file(s), 52 pass summary files, 7 route files; every active OpenSpec change archives into strictly valid specs; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test packages/contracts/test/*.test.ts test/generate-contracts.test.ts` | 125 tests, all passed |
| Same | `make contract-breaking-changes`, then `make contract-compatibility` | 80 breaking changes for `execution.asyncapi.json` against `10fc3bbe6b7c`, 0 for the others, `terminal.asyncapi.json` absent at the merge base; after the declaration, `Contract documents have no undeclared breaking change.` |
| Same | Spec delta requirement body lengths, in characters | `execution-wire-contracts`: Worker channels 465, Protocol version 372, G3 execution operations 479, Session work at protocol version 2 419, Session commands 455, Session command outcomes 443, Responses from an approver 300, Delegation result response command 329, Refreshed SCM credential notice 303, SCM credential adoption confirmation 360, Session observations 420, Worker relay connection 370, Terminal frames document 300, No secret on the worker wire 389; `control-plane-wire-contracts`: Operation roles 467, Terminal WebSocket upgrade 414, Terminal refusals 440, Terminal attach and CSRF token 318, Terminal lifetime 364, Terminal connection end 345, Terminal frame bounds 300; `scm-port`: Refreshed credential delivery 459 |
| `56e0ed00` | `bash -lc 'make findings ARGS="route --change define-worker-messages-and-terminal-contracts"'` | Committed unedited as `f86d3a4d`: tier `elevated` (triggers `lines`, `files`, `capabilities`, `contracts`), rule version 1; recommended pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow `jev-1.14.0` `elevated` (0.99), agreeing with the rule |
| `f86d3a4d`, clean tree | `make verify`, first run (log `wmt-verify-1.log` in the session scratchpad) | Failed in `make test`: one failure, `the schema tables cover every message of the execution channels` (`packages/adapters/nats/test/transport.test.ts`), because the NATS adapter's tables hold no session message; fixed by `7cabc322`, which limits the test to protocol version 1 messages (design decision 1) |
| `7cabc322` | `node --experimental-strip-types --test packages/adapters/nats/test/transport.test.ts` | 20 tests, all passed |
| `33d0ce5a` | `bash -lc 'make findings ARGS="route --change define-worker-messages-and-terminal-contracts"'` | Committed unedited as `594471b3`: the same tier, triggers, recommended reviewers, and shadow answer as the first route |
| `594471b3`, clean tree | `make verify`, second run (log `wmt-verify-2.log` in the session scratchpad) | Passed at the first attempt, stamp written; 3215 tests, 3162 passed, 0 failed, 53 skipped; generated part below |

## Limitations

- Contract only: no handler enforces the role and origin checks, the refusal order, the close codes, the bounded buffers, or the redaction; items 13, 18, 21, 38, and 39 must, and their tests must check them.
- `EXECUTION_PROTOCOL_VERSION` stays 1, so no build yet sends or accepts a session message; items 18 and 13 raise the windows (design decision 1).
- The assignment offer carries no agent session binding; the design's "Open question" leaves it to the architect.
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`; under governance "Routed effort" the coordinator assigns the reviewers and efforts.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `31bcdccafca6942044844b599055631109b7404b`; tests 3215, pass 3162, fail 0, skipped 53; all files 99.45% lines, 92.78% branches, 99.03% functions.
- `npm run openspec -- validate define-worker-messages-and-terminal-contracts --strict`: passed, `Change 'define-worker-messages-and-terminal-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 72 file(s); every pass summary file is valid: 52 file(s); every route file is valid: 8 file(s).`.
- Spec diff against the merge base `10fc3bbe6b7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Remaining gates

- Independent review passes 1 and 2, and pass 3 if governance "Conditional third pass" requires it.
- Archive on the branch (worker step 7).
- Integration into dev by the coordinator (single pull request).
