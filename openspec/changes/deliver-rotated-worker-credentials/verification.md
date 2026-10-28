# Verification

Date: 2026-10-28. The author's self-check, the checks, and the fail-before evidence are recorded below. The review has not run yet: passes 1, 2, and 3 are pending, and `findings.jsonl` and `passes.jsonl` are empty.

## Scope and source

G3 sub-change 26c of item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26): the delivery of a rotated credential generation to an enrolled worker. The decisions come from away run `20261027T221048Z-claude-63826` (item 26), decisions 6, 7, and 9, and away run `20261028T065320Z-claude-17941` (the away delegate Claude Fable 5.1), decisions 1 to 8, both relayed by the coordinator (Niki); the author's choices are marked in [design.md](design.md). It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/deliver-rotated-worker-credentials` on branch `deliver-rotated-worker-credentials`.

- **Base revision:** `a3a0ac4c` (`origin/dev`, merge of pull request #393).
- **Revision verified:** `d56b211f`, with this record uncommitted. Commits: the contracts, spec deltas, and docs (`9cfd0c46`); the implementation (`43ba12ee`); the tests (`c154b121`); the route record (`24b8f426`); the outbox query of the administration test (`13cd280f`); the route dropped and recorded again after that fix (`fb9b06a6`, `d56b211f`).
- **Scope:** request-only `rotate-worker --actor --reason`; the notice `worker.credentials.rotation-requested` through the outbox; `renewWorkerCredentials` and `confirmWorkerCredentials`; the hard cap in the grace-window sweep; the audit subject and the four worker-credential kinds; the worker's pending and adoption files, identity format 2, rotation driver, broker re-dial, bearer read per request, and the bounded stop on rejected broker credentials.
- **Out of scope:** 26d (the private-network bind and the second-host acceptance), mutual TLS, a worker-generated NKey at enrollment (a follow-up line under row 26 of the G3 plan), an HTTP status endpoint for rotations.

## Environment

macOS 26.6.2 arm64 (Apple M3), Node.js 24.22.1 from `.nvmrc`, Docker Desktop; the integration services that `make test` starts.

## Author self-check

- **Contract first.** `9cfd0c46` holds the proposal, design, six spec deltas, the execution OpenAPI document 0.5.0 to 0.6.0 (two operations, four schemas), the execution AsyncAPI document 0.7.0 to 0.8.0 (the notice), the declaration of the AsyncAPI document's three breaking changes in `packages/contracts/breaking-changes.json`, and the contract and guide sections, before any code commit. The OpenAPI additions report no breaking change.
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

## Review

The coordinator assigned reviewer A, Codex CLI `gpt-6.1-sol`, for passes 1 and 3 (pass 3 conditional), and reviewer B, Claude Code `claude-opus-5-5` with effort `high`, for pass 2. `route.json` recommends the efforts `high` and `xhigh`, which only governance can authorize. No pass has run.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `9eb26fae38fa168bc719d5079fabd87684d9360d`; tests 3177, pass 3162, fail 0, skipped 15; all files 99.38% lines, 92.64% branches, 99.08% functions.
- `npm run openspec -- validate deliver-rotated-worker-credentials --strict`: passed, `Change 'deliver-rotated-worker-credentials' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 70 file(s); every pass summary file is valid: 50 file(s); every route file is valid: 6 file(s).`.
- Spec diff against the merge base `a3a0ac4cea7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The Linux scenario runs and the native scenarios depend on hosts this change could not exercise here; `test/g2-scenarios/scenario-worker.ts` changed (the renewal client and the bearer provider) and ran only where `make verify` runs it.
- A worker that crashed after the renewal answer and before its adoption, and stays offline past the cap, holds the seed of N+1 but no JWT and no valid bearer; it stops with `credentials-expired` and must re-enroll (design, risks).
- The 7-day cap and the 10-minute floor are provisional, verified in G6.
- `make installation-smoke` was not run.

## Remaining gates

- Independent review passes 1, 2, and 3 (conditional) and their fixes.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
