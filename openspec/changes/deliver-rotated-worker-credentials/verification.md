# Verification

Date: 2026-10-28. The author's self-check, the checks, and the fail-before evidence are recorded below. Review pass 1 ran and its five findings are fixed (section "Review"); pass 2 and the conditional pass 3 are pending.

## Scope and source

G3 sub-change 26c of item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26): the delivery of a rotated credential generation to an enrolled worker. The decisions come from away run `20261027T221048Z-claude-63826` (item 26), decisions 6, 7, and 9, and away run `20261028T065320Z-claude-17941` (the away delegate Claude Fable 5.1), decisions 1 to 8, both relayed by the coordinator (Niki); the author's choices are marked in [design.md](design.md). It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/deliver-rotated-worker-credentials` on branch `deliver-rotated-worker-credentials`.

- **Base revision:** `a3a0ac4c` (`origin/dev`, merge of pull request #393); since the merge of `dev` below, `7efc48d3` (merge of pull request #396).
- **Revision verified:** `d56b211f`, with this record uncommitted. Commits: the contracts, spec deltas, and docs (`9cfd0c46`); the implementation (`43ba12ee`); the tests (`c154b121`); the route record (`24b8f426`); the outbox query of the administration test (`13cd280f`); the route dropped and recorded again after that fix (`fb9b06a6`, `d56b211f`).
- **Scope:** request-only `rotate-worker --actor --reason`; the notice `worker.credentials.rotation-requested` through the outbox; `renewWorkerCredentials` and `confirmWorkerCredentials`; the hard cap in the grace-window sweep; the audit subject and the four worker-credential kinds; the worker's pending and adoption files, identity format 2, rotation driver, broker re-dial, bearer read per request, and the bounded stop on rejected broker credentials.
- **Out of scope:** 26d (the private-network bind and the second-host acceptance), mutual TLS, a worker-generated NKey at enrollment (a follow-up line under row 26 of the G3 plan), an HTTP status endpoint for rotations.

## Environment

macOS 26.6.2 arm64 (Apple M3), Node.js 24.22.1 from `.nvmrc`, Docker Desktop; the integration services that `make test` starts.

## Author self-check

- **Contract first.** `9cfd0c46` holds the proposal, design, six spec deltas, the execution OpenAPI document 0.5.0 to 0.6.0 (two operations, four schemas; 0.7.0 since the merge of `dev` below), the execution AsyncAPI document 0.7.0 to 0.8.0 (the notice), the declaration of the AsyncAPI document's three breaking changes in `packages/contracts/breaking-changes.json`, and the contract and guide sections, before any code commit. The OpenAPI additions report no breaking change.
- **Architecture.** The renewal client port (`CredentialRenewalClient`) and the broker signing port (`BrokerCredentials.sign`) are in `@taskelith/fleet`; the HTTP client is in `@taskelith/worker-control-plane-client`; the NKey and JWT work and the `credentials-rejected` classification are in `@taskelith/nats`; the pending and adoption files are in `@taskelith/worker-journal`; the audit write helper is in `@taskelith/postgres`; the driver (`credential-rotation.ts`) and the bounded dial (`broker-dial.ts`) are in `apps/worker`. `npm run check:boundaries` passes.
- **Secrets.** No seed, bearer, or token crosses the wire on a renewal: the request carries the NKey public key and the SHA-256 of the new bearer. Log lines name generations, codes, and reasons only; `credential-rotation.test.ts` checks that no secret reaches the log, and the worker's terminal line holds no bearer (`worker-start.test.ts`). The pending file is created at mode `0600`.
- **Errors.** A refused renewal or confirmation is logged; no answer is retried with the launch retry delay; a journal file failure fails the driver and stops the worker; the sweep reports a command consumer it could not remove.
- **Comments.** `npm run verify:comments` passes.
- **Commit types.** `chore`, `test`, and `docs`; the published `taskelith` package does not change.

## Checks and results

- `npm run openspec -- validate deliver-rotated-worker-credentials --strict`: "Change 'deliver-rotated-worker-credentials' is valid".
- `make verify` at `d56b211f`: passed, profile full, tree `9eb26fae38fa168bc719d5079fabd87684d9360d`, stamp written; suites 46, tests 3177, pass 3162, fail 0, cancelled 0, skipped 15; all files 99.38% lines, 92.64% branches, 99.08% functions; "Every findings file is valid: 70 file(s); every pass summary file is valid: 50 file(s); every route file is valid: 6 file(s)."; "Contract documents have no undeclared breaking change."; "Verified 766 package paths"; "Totals: 72 passed, 0 failed (72 items)"; "Every active OpenSpec change archives into strictly valid specs."; "Packed file allowlist and installed CLI verification passed.".
- Coverage of new modules in that run (lines, branches, functions): `broker-dial` 100, 100, 100; worker `credential-rotation` 100, 90.63, 100; `broker-failure` 100, 91.67, 100; `http-credential-renewal-client` 100, 91.30, 100; `credential-rotation-files` 100, 82.61, 100; `enrollment-service` 98.79, 80.61, 100; fleet `credential-audit` and `credential-rotation` 100, 100, 100.
- The first `make verify`, at `24b8f426`, failed with 2 of 3177 tests: `administration.integration.test.ts` queried a column `subject` that the `outbox` table does not have (fixed in `13cd280f`, which reads it from the stored message), and `test/installation-script.test.ts` "a bound with a leading zero is read in base 10" ended after 9.118 s instead of at least 10 s, a timing test this change does not touch; it passed in the run above.
- `make findings ARGS="route --change deliver-rotated-worker-credentials"`: tier `elevated` (lines, files, capabilities, security, contracts, size), rule version 1; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; the shadow router agrees. As the fix in `13cd280f` changed the diff, `route.json` was deleted and routed again with the same outcome.
- `make verify-installation` (Docker): exit 0 at `d56b211f`, "installation.sh: built, bootstrapped, started, enrolled, admitted, restarted, admitted again, certificates re-issued and served, removed"; its log holds no `PRIVATE KEY` line and no `tken_` token.

## Fails before the change

Base `a3a0ac4c` had no renewal, confirmation, notice, driver, or audit subject, so each test below was shown to fail by mutating the committed implementation at `c154b121`, rebuilding the package with `tsc -b`, and running the test by name; after each run the file was restored with `git checkout --`, rebuilt, and the test passed again (each restored run: fail 0).

| # | Behaviour | Mutation | Test | Result under mutation |
| --- | --- | --- | --- | --- |
| 1 | Renewal without an open request for N+1 is 409 `rotation-not-requested` | `EnrollmentService.renew` and `renewCredentials` check only that a rotation exists | `fleet.test.ts` "a renewal without an open request for the next generation is rotation-not-requested" | 1 fail |
| 2 | A repeated renewal answers the stored JWT | `renewedAnswer` always returns `undefined` | `fleet.test.ts` "a repeated renewal with the same material answers the same JWT; other material is renewal-mismatch" | 1 fail |
| 3 | The confirmation drops N at once | `confirmCredentials` drops nothing | `fleet.test.ts` "the confirmation drops the predecessor at once and publishes its revocation" and the in-memory conformance case "a confirmation drops the predecessor at once and records it; a repeat drops nothing" | 2 fail |
| 4 | At the cap an unconfirmed N+1 stays and N goes (the confirmation never arrives) | `renewCredentials` keeps N valid until 9999 | `fleet.test.ts` "at the deadline an unconfirmed renewal keeps N+1 and drops N" and the in-memory conformance case "at the deadline an unconfirmed renewal drops the predecessor and keeps the new generation" | 2 fail |
| 5 | At the cap a never-renewed rotation revokes the worker | `expireGraceWindows` skips `#revokeUnrenewed` | `fleet.test.ts` "at the deadline a rotation that was never renewed revokes the worker" | 1 fail, 1 pass |
| 6 | A worker restarted between adoption and confirmation continues on N+1 and confirms | the driver idles while the identity keeps `previous` | `credential-rotation.test.ts` "a worker restarted between the adoption and the confirmation continues on N+1 and confirms it" | not ok, test timed out after 30000 ms |
| 7 | The confirmation follows only a link with N+1 | the driver confirms without the link check | `credential-rotation.test.ts` "a notice for the next generation renews it, adopts it, re-dials, and confirms after the new link" | not ok, test timed out after 30000 ms (no re-dial) |
| 8 | 3 rejected rounds stop the worker with `credentials-expired` | `BrokerDial` never returns the stop | `broker-dial.test.ts` "the third round in which every generation was rejected is credentials-expired" (1 fail) and `worker-start.test.ts` "a worker whose every generation the broker rejected in 3 rounds stops with credentials-expired" | 1 fail; not ok, timed out after 30000 ms |
| 9 | Every rotation audit event names the worker as subject | `credentialEvent` writes subject `operator` | in-memory conformance case "every rotation event names the worker as subject and the new generation" | 1 fail |
| 10 | NATS refusals carry `credentials-rejected` | `brokerFailure` never adds the reason | `transport.test.ts` "a refused user is credentials-rejected, also behind a cause; other failures are not" | 1 fail |

The PostgreSQL registry runs the same conformance cases in `fleet-conformance.integration.test.ts`, and `broker-credentials.integration.test.ts` checks against the test NATS server that a revoked user's connection fails with reason `credentials-rejected`, a TLS failure without it, and a worker-generated key connects with the JWT signed for it. The end-to-end test in `control-plane-api.integration.test.ts`, "a rotation reaches the running worker, which renews, re-dials with N+1, and confirms", runs the real worker against the running control plane: the audit trail holds `rotation-requested`, `renewed`, and `confirmed` for generation 2, the old bearer is refused, and the restarted worker connects with generation 2. These integration tests were written with the implementation and passed in `make verify`; they have no separate fail-before run.

## Merge of dev

Before pass 1, `a67e3ac7` merged `origin/dev` at `7efc48d3` (pull requests #394 `define-board-session-and-event-stream-contracts`, #395 `extend-execution-http-contracts`, and #396 `schedule-intent-and-council-gates`) into the branch head `469da7b8`.

- **Conflicts.** `packages/contracts/documents/execution.openapi.json` conflicted in `info.description` and at the end of `components.schemas`, where both sides added schemas. It was resolved by a three-way JSON merge: dev's 9c operations and schemas and this change's two operations and four schemas are all kept, the renewal and confirmation paths stay after `/workers/enrollments`, and the description is dev's with the 26c clause. `docs/contracts/execution-wire-contracts.md` conflicted in the version table: AsyncAPI 0.8.0 from this change, and the OpenAPI row of dev with the 26c operations. `docs/g3-plan.md` merged without a conflict.
- **Version.** Sub-change 9c took OpenAPI 0.6.0 on `dev`, so the execution OpenAPI document moves to 0.7.0, one minor above it; the AsyncAPI document stays 0.8.0, since `dev` did not change it. `8affae67` moves the 9c version test to 0.7.0, and `4f3f2a81` the proposal, design, and tasks.
- **Spec deltas.** `4f3f2a81` first carried dev's new text of "Execution HTTP operations" with this change's two operations; that text exceeded 500 characters and failed `verify:archive`, so `1211ef8a` drops the modified requirement and the added "Credential rotation notice" now defines `renewWorkerCredentials` and `confirmWorkerCredentials`. The other modified requirements are on capabilities that `dev` did not change.
- **Breaking changes.** `dev` did not change `packages/contracts/breaking-changes.json`. `43aef0a8` lists this change's three AsyncAPI breaking changes against `7efc48d3`, entries unchanged. `make contract-compatibility` reports 0 breaking changes for every document against `7efc48d330b4` except `execution.asyncapi.json` with 3, and "Contract documents have no undeclared breaking change."
- **Checks.** `npm run openspec -- validate --all --strict`: 72 passed, 0 failed. `make verify` on the clean tree at `1211ef8a` passed with the full profile and wrote the stamp (generated checks below). `make verify-installation` was not run: the merge touched no installation code path.
- **Route.** The merge changed the diff against the new merge base, so `route.json` was deleted (`ee76ce9a`) and routed again against `7efc48d3`: tier `elevated` (lines, files, capabilities, security, contracts, size), rule version 1; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; the shadow router agrees.

## Review

The coordinator assigned reviewer A, Codex CLI `gpt-6.1-sol` with effort `medium`, for passes 1 and 3 (pass 3 conditional), and reviewer B, Claude Code `claude-opus-5-5` with effort `high`, for pass 2. `route.json` recommends the efforts `high` and `xhigh`, which only governance can authorize; the coordinator confirmed that the reviews run at the brief's efforts until the owner authorizes routed effort.

### Pass 1

- **Reviewer:** A, Codex CLI `gpt-6.1-sol`, effort `medium`, session `01a182e0-3ecb-7ed3-b5e8-edd9da50ea9f`, as the coordinator relayed the result.
- **Reviewed range:** `7efc48d3...c64ed5e4`.
- **Snapshot:** identical before and after the pass, `39a57c703190bb094d060e3b555cd634f028f3d527d984b3a5ed5698a36d3255`.
- **Counts:** Critical 0, High 2, Medium 3, Low 0, as in `passes.jsonl`; each finding is a line of `findings.jsonl`, all `fixed`.

Each finding was checked against the code before its fix and is real. Each fail-before run mutated the fixed code back, rebuilt the package with `tsc -b`, and ran the named tests with `--test-timeout=30000`; after each run the file was restored with `git checkout --`, rebuilt, and the same tests passed (fail 0).

| Finding | Resolution | Commit | Mutation | Result under mutation |
| --- | --- | --- | --- | --- |
| F1 High, `credential-rotation.ts:51` (fleet domain): a first renewal ignored the deadline, so before the sweep the old bearer renewed and escaped the revocation at the cap | `FleetRegistry.renew` takes the service's `Clock` and reads it after the row lock; `renewalStep` refuses a first renewal at or after the deadline as `forbidden`, reason `rotation-expired`, which the service answers as 401 `worker-not-authorized`; the sweep then revokes the worker | `350c535a` | (a) the deadline check removed; (b) the service passes a clock fixed before the registry call; (c) the PostgreSQL registry reads the clock before its row lock | (a) 3 fail: `fleet.test.ts` "a first renewal after the deadline is refused before the sweep, which then revokes the worker" and "a renewal whose registry write waits past the deadline is refused", in-memory conformance "a first renewal at the deadline is forbidden and leaves the rotation to the sweep"; (b) 1 fail, the second test; (c) 1 fail, `fleet-conformance.integration.test.ts` "a renewal that waits for the row lock until past the deadline is refused", run against `make services-up` |
| F2 High, `apps/worker/src/credential-rotation.ts:101`: a notice for the generation after an unconfirmed adoption was acknowledged and dropped | The notice for the next generation is stored as `pending.<N+2>` before the acknowledgement also while an adoption is unconfirmed; a finished confirmation continues the driver, which renews the stored generation with the adopted bearer | `bd066a06` | (a) the old `previous !== undefined` condition restored; (b) the driver idles after a confirmation | `credential-rotation.test.ts` "a next notice while a confirmation answer was lost is stored, then renewed after that confirmation": (a) 1 fail; (b) not ok, timed out after 30000 ms (cancelled) |
| F3 Medium, `credential-rotation.ts:62` (fleet domain): a confirmation after the deadline and before the sweep was recorded as confirmed | `confirmationStep` first applies `predecessorExpiryStep` at the time read after the lock, writing `worker-credential.rotation-expired` with reason `unconfirmed`, and the confirmation is then a repeat | `350c535a` | the expiry step skipped | 2 fail: `fleet.test.ts` "a confirmation after the deadline expires the predecessor as unconfirmed, before or after the sweep" and in-memory conformance "a confirmation past the deadline expires the predecessor as unconfirmed, in either order with the sweep" |
| F4 Medium, `enrollment-service.ts:180`: a repeated confirmation answered `revocationsPublished: true` without publishing | Every confirmation publishes the recorded revocations and reports that result | `ced43fa0` | the old `confirmed.value ? publish : true` restored | 1 fail: `fleet.test.ts` "a repeated confirmation retries a revocation publication that failed" |
| F5 Medium, `credential-rotation-files.ts:87`: a crash after the identity dropped the predecessor left its files and the pending file for good | `removeSupersededGeneration` removes the files of the generation before the current one and the current one's pending file when the identity keeps no predecessor; `finishAdoption` calls it after the identity replacement and `CredentialRotation.open` at every start | `cf21ed73` | (a) `open` skips the removal; (b) `removeSupersededGeneration` removes nothing | (a) 1 fail: `credential-rotation.test.ts` "a start after a crash in the removal of the confirmed predecessor removes its files", which recreates the crash after the identity replacement and two partial removals; (b) 2 fail: that test and `credential-rotation-files.test.ts` "only a confirmed generation has its predecessor and its pending file removed; the next pending file stays" |

- **Checks after the fixes.** `make verify` on the clean tree of `7bd76051` passed with the full profile (generated checks below). F5 changed the worker's start path (`CredentialRotation.open`), so `make verify-installation` ran on that commit: exit 0, "installation.sh: built, bootstrapped, started, enrolled, admitted, restarted, admitted again, certificates re-issued and served, removed", and its log holds no `PRIVATE KEY` line and no `tken_` token. `make findings ARGS="validate"` passes.
- **Follow-on fixes.** The two PostgreSQL sweep tests whose helper renewed exactly at a deadline equal to the request time renew 1 ms before the deadline (`29e2ba49`); a port comment over two lines was shortened (`25db37ee`).
- **Contracts and specs** (`e3432b30`). The execution OpenAPI document stays 0.7.0: only the descriptions of the renewal's 401, the confirmation's 200, and `CredentialConfirmation` change, since a late first renewal answers the existing 401. `make contract-compatibility` reports 0 breaking changes for `execution.openapi.json` against `7efc48d330b4`, the AsyncAPI document's 3 declared ones unchanged, and "Contract documents have no undeclared breaking change." The installation contract (section 6 renewal, confirmation, and retry; section 10 rotation), the worker journal contract's retention row, the design, and the deltas `installation-enrollment` (scenarios "First renewal after the deadline", "Repeated confirmation after a failed publication", "Confirmation after the deadline"; the confirmation requirement), `worker-runtime` (scenarios "Notice before the confirmation finished", "Crash during the removal of the predecessor's files"; the start requirement), and `worker-journal-adapter` (scenario "Crash after the identity dropped the predecessor") state the new rules.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `31725070946cbf67b3302dec6317f04ad07ebc26`; tests 3229, pass 3214, fail 0, skipped 15; all files 99.43% lines, 92.64% branches, 99.08% functions.
- `npm run openspec -- validate deliver-rotated-worker-credentials --strict`: passed, `Change 'deliver-rotated-worker-credentials' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 73 file(s); every pass summary file is valid: 53 file(s); every route file is valid: 9 file(s).`.
- Spec diff against the merge base `7efc48d330b4` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a182e0-3ecb-7ed3-b5e8-edd9da50ea9f` | 0 | 2 | 3 | 0 |
<!-- make record: end -->

## Limitations

- The Linux scenario runs and the native scenarios depend on hosts this change could not exercise here; `test/g2-scenarios/scenario-worker.ts` changed (the renewal client and the bearer provider) and ran only where `make verify` runs it.
- A worker that crashed after the renewal answer and before its adoption, and stays offline past the cap, holds the seed of N+1 but no JWT and no valid bearer; it stops with `credentials-expired` and must re-enroll (design, risks).
- The 7-day cap and the 10-minute floor are provisional, verified in G6.
- `make installation-smoke` was not run.

## Remaining gates

- Independent review pass 2 and the conditional pass 3, and their fixes.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
