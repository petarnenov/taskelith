# Verification: define-worker-messages-and-terminal-contracts

Status: developed and verified by the author; review pass 1 by reviewer A done and its findings fixed except one deferred to the architect; pass 2 pending.

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9d, size M, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent. Contract-first only: the protocol version 2 messages of `execution.asyncapi.json`, the new `terminal.asyncapi.json`, the terminal and relay upgrades, generated types, contract tests, the contract page, the wording fixes of the refreshed SCM credential, and the spec deltas.
- The architect's decisions of 2026-10-28 as the brief gives them: the terminal upgrade in OpenAPI and its frames, the relay frames included, in `terminal.asyncapi.json`; a refreshed SCM credential as a notice only, fetched with 9c's `fetchRunScmCredential`, with the wording fixes here; protocol versions 1 and 2 accepted and session work only to version 2 workers; the delegation response command here; byte-identical shared names and no path in two documents.
- Where the sources are silent, [design](design.md) decisions 1 to 17 record the minimal shape chosen and the source it relies on. The first draft's open question, the offer's agent session binding, the architect answered on 2026-10-28: 9d adds it to the protocol version 2 offer, additively, and item 18 implements it (design "Session binding of the offer").
- Reviewer efforts (architect, 2026-10-28): reviewer A Codex `gpt-6.1-sol` at `medium` and reviewer B `claude-opus-5-5` at `high`, as the brief names them, because governance "Routed effort" is not authorized yet. The route recommends A at `high` and B at `xhigh`, tier `elevated`, and the shadow `jev-1.14.0` agrees (`elevated`, 0.99); the architect kept the brief's efforts.
- Excluded: adapters, handlers, the worker host, the relay server, and any runtime (items 13, 18, 21, 38, 39, and 40); raising `EXECUTION_PROTOCOL_VERSION`.

## Revision

- Created from `dev` `72989e7c` as briefed. Before the first commit, 9c (`extend-execution-http-contracts`, #395) landed in `dev` as `10fc3bbe`, and the branch, still without commits, fast-forwarded to it (design decision 17); `10fc3bbe` is the merge base.
- `56e0ed00` `chore(contracts): define the worker session messages and the terminal contracts` (documents, generator list, exported constant, breaking-change declarations, contract tests, contract pages, G3 plan row 9, source control contract, change record, spec deltas).
- `f86d3a4d` `docs: route the define worker messages and terminal contracts change` (`route.json`, unedited). The first `make verify` run checked this commit's tree and failed in one test (Checks).
- `7cabc322` `test(nats): cover only the protocol version 1 messages in the schema table test` (the NATS adapter test, the contract page section 12 item 13 obligation, design decision 1).
- `33d0ce5a` `docs: drop the route record before routing the changed diff again` and `594471b3` `docs: route the define worker messages and terminal contracts change again` (`route.json`, unedited), because the fix changed the routed diff (worker step 4). The second `make verify` run checked the tree of `594471b3`, `31bcdccafca6942044844b599055631109b7404b`.
- `98f10d40` `docs: record the verification of the define worker messages and terminal contracts change` (this record, task 4.1).
- `3ffa0eb4` `chore(contracts): bind the protocol version 2 assignment offer to its agent session` (the architect's answer of 2026-10-28: `AssignmentSessionBinding` and the offer's `session`, the tests, the breaking-change declaration, the contract pages, the design, proposal, tasks, and spec delta).
- `992b1d03` `docs: drop the route record before routing the session binding` and `1728da48` `docs: route the define worker messages and terminal contracts change with the session binding` (`route.json`, unedited), because the binding changed the routed diff before pass 1 (worker step 4). The third `make verify` run checked the tree of `1728da48` and failed in one test (Checks).
- `ce1f54b5` `test(nats): tell session work by the payload's protocol version in the schema table test`, because the offer payload's `if` now names `SessionProtocolVersion` and the test's text search took the offer for session work (design decision 1).
- `cd436617` `docs: drop the route record before routing the schema table test fix` and `22e7aada` `docs: route the define worker messages and terminal contracts change after the schema table test fix` (`route.json`, unedited), because the fix changed the routed diff (worker step 4). The fourth `make verify` run checked the tree of `22e7aada`, `a4907d444c87716da32f1688d7d8d84a67446f9b`.
- `b7a90da5` `docs: record the verification of the session binding of the define worker messages and terminal contracts change` (this record), the head that review pass 1 reviewed.
- `a03dee0c` `chore(contracts): fix the review pass 1 findings of the worker messages and terminal contracts` (Independent review, Pass 1). `route.json` stays as routed, because the review has started.
- `837d51a5` `docs: record review pass 1 of the define worker messages and terminal contracts change` (findings, passes, this section, tasks); the fifth `make verify` run checked its tree, `e30d90c6e351eb006e592996e1d0b00b6e475d9a`.
- The commit after it records that run.

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js v24.22.1 from `.nvmrc` through the `make` targets; Docker for `make test` and `make contract-breaking-changes`.

## Author self-check

- **Scope.** `execution.asyncapi.json` 0.7.0 to 0.8.0 with 4 commands and 11 observations of protocol version 2; `terminal.asyncapi.json` 0.1.0 with 7 browser frames and 8 relay frames; `control-plane.openapi.json` 0.2.0 to 0.3.0 with `openTerminal` and `TerminalRefusal`; `execution.openapi.json` 0.6.0 to 0.7.0 with `openWorkerRelay` and `RelayRefusal`; `SESSION_PROTOCOL_VERSION` exported; `EXECUTION_PROTOCOL_VERSION` unchanged at 1 (design decision 1).
- **Shared vocabulary.** The messages copy 19 schemas of the control-plane and execution documents, and the terminal document 5, from those documents by a script, so they are byte-identical; the generator, which refuses one name with two definitions, generated the bundle, and `a schema name means the same schema in every document that defines it` now also covers `terminal.asyncapi.json` and names seven 9d shared schemas that it must find. The 9b test `the schemas that the worker messages reuse use only keywords that draft-07 reads alike` covers the reused session schemas.
- **No path in two documents.** The terminal channels have `address: null` (design decision 13); `openTerminal` is only in the control-plane document and `openWorkerRelay` only in the execution document, which the generator's `mergeOpenapi` checks.
- **Breaking changes.** `make contract-breaking-changes` against `10fc3bbe` printed 80 changes for `execution.asyncapi.json` 0.8.0, all additions (15 messages, 50 schemas, 15 operation message entries), and none for the other documents; the entry is in `packages/contracts/breaking-changes.json` with its reason, and `make contract-compatibility` then reported `Contract documents have no undeclared breaking change.` With the session binding it printed 105, the 80 and 25 more: `AssignmentSessionBinding` and the offer's `session`, `if`, `then`, and `else` at each of the six places the diff names the offer payload. The one 0.8.0 entry now lists the 105, because 0.8.0 is not yet on `dev`, so the version stays 0.8.0.
- **Session binding.** From protocol version 2 the offer requires `session` (`AssignmentSessionBinding`: `sessionId` as `AgentSessionId`, `harness`, `model`, `effort`, optional `resume` with `nativeSessionId` and a `generation` of at least 2), and at version 1 it forbids it, so a version 1 offer is valid exactly as before; the binding names no credential, which tests check. No semantic narrowing hides from the check: no existing operation or message changed its meaning (design decision 15).
- **Redaction.** No message reaches a secret schema and no document holds an example, which tests check; the notice's payload has exactly `protocolVersion`, `runId`, `credentialId`, and `version`. The redaction rule is named in the contract page section 10.
- **Error answers.** `openTerminal` answers 101, 400, 401, 403 (`role-required` or `csrf-token-invalid`), 404, 422 (`attempt-not-current`, `terminal-not-offered`), 500, and 503; `openWorkerRelay` 101, 400, 401, 422 (`protocol-not-supported`), 500, and 503; every close has a code and a `TerminalCloseReason`; every worker refusal a `TerminalRefusalReason`.
- **Fail-before.** See [design](design.md) "Fail-before": before the implementation the two new files failed to load, then 14 of 64 tests failed with the export in place; after it, 125 of 125 tests of the contract package and the generator passed. The session binding's 2 tests failed on `98f10d40` (14 tests, 12 pass, 2 fail), and after the binding 127 of 127 passed.
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
| `98f10d40`, test file only changed | `node --experimental-strip-types --test packages/contracts/test/worker-session-messages.test.ts`, after `npm run build` (log `wmt-binding-fail-before.log`) | 14 tests, 12 passed, 2 failed: the two session binding tests (fail-before) |
| Working tree before `3ffa0eb4` | `npm run build`, then `node --experimental-strip-types --test packages/contracts/test/*.test.ts test/generate-contracts.test.ts` (log `wmt-binding-after.log`) | 127 tests, all passed |
| Same | `make contract-breaking-changes`, then `make contract-compatibility` | 105 breaking changes for `execution.asyncapi.json` against `10fc3bbe6b7c`, 0 for the others; after amending the 0.8.0 entry, `Contract documents have no undeclared breaking change.` |
| Same | `npm run openspec -- validate define-worker-messages-and-terminal-contracts --strict`; `npm run verify:links`; `npm run verify:comments`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Valid; every checked link conforms; every comment is within the rule; every active change archives into strictly valid specs; `tsc` exit 0 |
| Same | Body length of the new requirement Session binding of an offer, in characters | 415 |
| `992b1d03` | `bash -lc 'make findings ARGS="route --change define-worker-messages-and-terminal-contracts"'` | Committed unedited as `1728da48`: tier `elevated` (triggers `lines`, `files`, `capabilities`, `contracts`), rule version 1; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow `jev-1.14.0` `elevated` (0.99), agreeing with the rule |
| `1728da48`, clean tree | `make verify`, third run (log `wmt-verify-3.log` in the session scratchpad) | Failed in `make test`: one failure, `the schema tables cover every protocol version 1 message of the execution channels` (`packages/adapters/nats/test/transport.test.ts`), which listed `AssignmentOfferCommand` as session work; fixed by `ce1f54b5` |
| `ce1f54b5` | `node --experimental-strip-types --test packages/adapters/nats/test/transport.test.ts`; `npx tsc -p tsconfig.check.json` | 20 tests, all passed; `tsc` exit 0 |
| `cd436617` | `bash -lc 'make findings ARGS="route --change define-worker-messages-and-terminal-contracts"'` | Committed unedited as `22e7aada`: the same tier, triggers, recommended reviewers, and shadow answer |
| `22e7aada`, clean tree | `make verify`, fourth run (log `wmt-verify-4.log` in the session scratchpad) | Passed at the first attempt, stamp written; 3217 tests, 3164 passed, 0 failed, 53 skipped; generated part below |

## Limitations

- Contract only: no handler enforces the role and origin checks, the refusal order, the close codes, the bounded buffers, or the redaction; items 13, 18, 21, 38, and 39 must, and their tests must check them.
- `EXECUTION_PROTOCOL_VERSION` stays 1, so no build yet sends or accepts a session message; items 18 and 13 raise the windows (design decision 1).
- The agent harness port's start and resume requests take no model or effort yet; items 18 and 19 carry the binding's model and effort to the plugin.
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`; the architect kept the brief's `medium` and `high`, because governance "Routed effort" is not authorized yet.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `e30d90c6e351eb006e592996e1d0b00b6e475d9a`; tests 3220, pass 3167, fail 0, skipped 53; all files 99.45% lines, 92.80% branches, 99.00% functions.
- `npm run openspec -- validate define-worker-messages-and-terminal-contracts --strict`: passed, `Change 'define-worker-messages-and-terminal-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 72 file(s); every pass summary file is valid: 52 file(s); every route file is valid: 8 file(s).`.
- Spec diff against the merge base `10fc3bbe6b7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a182e0-3947-77e3-851c-7879eb0bfb88` | 0 | 3 | 4 | 0 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox read-only, session `01a182e0-3947-77e3-851c-7879eb0bfb88`, on `b7a90da5` (diff `10fc3bbe...b7a90da5`). The worktree snapshot (`git ls-files -co --exclude-standard | xargs sha256sum | sha256sum`) before and after the review was `c92a16a8ebfc5e55585bbb6702f2ebe9d6480f24f2e9ea45a2ad00bf9e92d487`, unchanged.
- Invocation: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> -o <report> - < <prompt-file>`, the Codex CLI (gpt-6.1-sol) row of the [agent task protocol](/docs/agent-task-protocol.md). Model confirmation: the Codex log header showed `model: gpt-6.1-sol`, `reasoning effort: medium`, `sandbox: read-only`.
- Result: Critical 0, High 3, Medium 4, Low 0, each claim checked against its source before the fix; six fixed in `a03dee0c`, one deferred to the architect, all recorded in `findings.jsonl` ([design](design.md) "Review pass 1 fixes").
  1. High, one attempt's adoption ended a credential the run's other attempts share (execution wire contracts section 8.7): a version ends only once every attempt of the run that held it adopted it or a later one or no longer holds its ownership, decided serialized per run (contract page section 6, "Run-wide end"; scenario "Second attempt still holds the previous version").
  2. High, no recovery epoch on the 11 new observations: each payload requires `recoveryEpoch`, and one of another epoch or received in quarantine is evidence only, as launch authorization section 7 states (contract page section 9; requirement "Session observation recovery epoch").
  3. High, `port-refused` for every refusal of a turn delivery: confirmed, because the port's `conflict` for a seen turn ID proves acceptance (agent harness port section 6). Not fixed: it needs a timeline transition that no source defines, so it is deferred to the architect with the question below.
  4. Medium, the classified operation dropped: `RequestRecordedPayload` carries an optional `ClassifiedOperation` for a permission request only, and a standing rule matches only a push to the task's branch (contract page section 9; requirement "Classified permission request").
  5. Medium, a host turn for an answered request: only `expired` and `unresolved` take one; a result for an `answered` request is a repeat (contract page section 5; scenario "Result for an answered request").
  6. Medium, no command for a rejected delegation: the command is due when the result becomes `ended`, a rejected delegation included (contract page sections 3 and 5; scenario "Rejected delegation").
  7. Medium, no typed terminal start failure: `TerminalRefusalReason` gains `terminal-start-failed` (contract page section 8; requirement "Terminal start failure").
- Architect question (finding 3). When `submitTurn` answers `conflict` for the delivered turn ID, or a crash leaves its acceptance unknown, the turn is in fact delivered or may be, and the session timeline (section 4.2 and section 6) has no transition from `queued` for it, so it would block `nextDeliverableTurn`. Options: (a) the worker reports `session.turn.delivered` on `conflict` in the command's generation, and the turn becomes `outcome-unknown` when that generation ends, which blocks the session's later turns until then; (b) a new reason `acceptance-unknown` for `conflict`, a timeout, or a crash, and a new timeline operation, owned by the session timeline contract and item 13, that makes a `queued` turn `outcome-unknown`, final and never resent, as section 6 treats a delivered turn at a generation's end, so the next queued turn proceeds; (c) restrict `port-refused` to the refusals that prove non-acceptance now and leave `conflict` to items 13 and 18 as an obligation. Author's recommendation: (b), because the port asks the host to reconcile through the timeline and never resubmit, and `outcome-unknown` is the timeline's existing state for a turn whose outcome is lost.
- Fix checks, on the working tree of `a03dee0c`:

| Command | Result |
| --- | --- |
| Fail-before: `node --experimental-strip-types --test packages/contracts/test/worker-session-messages.test.ts packages/contracts/test/terminal-contracts.test.ts` with only the test files changed on `b7a90da5`, after `npm run build` (log `wmt-pass1-fail-before.log`) | tests 26, pass 17, fail 9: `a terminal ends with its reason, and with the worker's refusal exactly when it was refused`, `relay frames name their terminal, and an open names the attempt, execution, and generation it joins`, `every session command and observation is valid at protocol version 2 and refused at version 1`, `every session observation names the recovery epoch that is checked before its effect`, `the worker confirms the adoption of a refreshed version, or says why it kept its current one`, `one attempt's adoption never ends a version that another attempt of the run still holds`, `a permission request carries the plugin's classification of its operation, and no other request does`, `a turn ends with one outcome of the port, with a failure exactly when it failed`, `the largest session message fits the broker payload limit` |
| `npm run build`, then `node --experimental-strip-types --test packages/contracts/test/*.test.ts test/generate-contracts.test.ts` (log `wmt-pass1-after.log`) | 130 tests, all passed |
| `node --experimental-strip-types --test packages/adapters/nats/test/transport.test.ts` | 20 tests, all passed |
| `make contract-breaking-changes`, then `make contract-compatibility` | 106 breaking changes for `execution.asyncapi.json` against `10fc3bbe6b7c`, the 105 and `add /components/schemas/ClassifiedOperation`, 0 for the others; after the 0.8.0 entry lists the 106, `Contract documents have no undeclared breaking change.` |
| `npm run openspec -- validate define-worker-messages-and-terminal-contracts --strict`; `npm run verify:links`; `npm run verify:comments`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Valid; every checked link conforms; every comment is within the rule; every active change archives into strictly valid specs; `tsc` exit 0 |
| Body lengths of the changed and new `execution-wire-contracts` requirements, in characters | Delegation result response command 438, SCM credential adoption confirmation 471, Session observation recovery epoch 428, Classified permission request 333, Terminal start failure 365 |
| `make findings ARGS="validate"` | `Every findings file is valid: 72 file(s); every pass summary file is valid: 52 file(s); every route file is valid: 8 file(s).` |
| `make verify` on `837d51a5`, clean tree (log `wmt-verify-5.log` in the session scratchpad), one run, no rerun | Passed, profile full, tree `e30d90c6e351eb006e592996e1d0b00b6e475d9a`, stamp written; generated part above |

The fixes change contracts, not only records, and pass 1 found High findings, so pass 2 by reviewer B is required, and pass 3 by reviewer A if governance "Conditional third pass" requires it after pass 2.

## Remaining gates

- The architect's answer to the pass 1 question (finding 3) and its fix, which pass 2 or a later pass reviews.
- Independent review pass 2, and pass 3 if governance "Conditional third pass" requires it.
- Archive on the branch (worker step 7).
- Integration into dev by the coordinator (single pull request).
