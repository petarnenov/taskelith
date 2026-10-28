# Verification: implement-operator-login-and-roles

Status: implemented and verified by the author; review pass 1 found 1 High and 7 Medium findings, all fixed, M3 under coordinator decision (c); review pass 2 found 3 Medium and 6 Low findings, all fixed; review pass 3 by reviewer A confirmed the nine pass 2 fixes and found nothing new; archived on the branch, integration into dev pending.

## Scope and source

- G3 item 10 ([G3 work plan](/docs/g3-plan.md), row 10, decision D2 (a)), size M-L, commit type `chore`, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent from `dev` `a3a0ac4c`.
- Sources and exclusions: [design](design.md) "Context" and "Sources".

## Revision

- Base: `dev` `a3a0ac4c`.
- Verified head: `e9b1c6c6` (tree `62f44a75`), commits `823b92de` to `e9b1c6c6` on the branch, then the records of the reviews, the merge of `dev` `a10ceaaf` in `02805b7b`, and the archive commit (Archive checks below); with the merges of `dev` `10fc3bbe` and `7efc48d3`, the fixes of review pass 1, the coordinator's decision (c) on its finding 4 included, and the fixes of review pass 2.

## Environment

macOS x86_64 (2020 Intel iMac), Node.js 24.22.1 through the `.nvmrc` pin, Docker Desktop for the `make test` services.

## Author self-check

Review checklist (`checklist.json`):

- **contract-drift.** `test/access-requirements.test.ts` reads `control-plane.openapi.json`: every operation has its own rule, each matches its wire contracts section 3 row, and the served 9a routes accept exactly the document's security alternatives. `details.requiredRole` is accepted unchanged by `AccessDenial` (`additionalProperties` of type string), so no schema changes; wire contracts section 2 now names it (Q10).
- **missing-fail-before-test.** The change adds behaviour rather than fixing a defect; the session, CSRF, and role tests fail before it, because `/session` had no route and the server checked no role.
- **docs.** Wire contracts section 2 records the `createRun` exception with its three conditions, which `test/browser-session.test.ts` checks over HTTP (R2); `design.md` records the coordinator answers R1 to R4, that `createRun` is checked after its body is validated, and that the G2 documents declare no 403 on the operator operations, which only the owner bearer reaches until item 11. The dependency register notes the use of `cookie@2.0.1` and `crypto.argon2`; both stay `candidate`, as the register has no `adopted` status.
- **naming.** One term per concept: principal, installation role, project role, session, requirement, rule.
- **error-handling.** A store failure is 503, never a refused credential; an unknown operation fails closed to `installation-owner`.
- **spec-wording.** The deltas follow the coordinator decisions Q1 to Q13.
- **concurrency-race.** Owner creation under two concurrent pools is tested against PostgreSQL; the in-memory store serializes its transactions.
- **audit.** A refused `init` and a no-op or losing owner bootstrap each write an audit event without secrets, tested in the module, against PostgreSQL, and end to end through the administrative entry (R3).
- **redaction.** Tests show that no log line, failure body, or audit event holds a password, session identifier, CSRF token, or the operator bearer, and that a body breaking the login schema names no password.

ADR 0004: hexagonal ports in `@taskelith/access` with in-memory and PostgreSQL adapters under one conformance suite; the hasher in `@taskelith/secrets`; contract-first (the document drives the requirement tests); Makefile-driven checks; coverage below.

## Checks

- `env -u JEV_MAF_LAB make findings ARGS="route --change implement-operator-login-and-roles"`: elevated (lines, files, security, contracts, size), rule version 1; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow failed (`missing-credential`). The first `route.json`, on `d8a2a0e3`, was routed again on `ac79878f`, because the fix below changed the diff. It was routed a third time on `14f968d8` against `dev` `7efc48d3`, with the same tier, triggers, and reviewers, because the diff changed since `ac79878f`: the fixes of the coordinator's R2 to R4 answers, the merges of `dev` `10fc3bbe` and `7efc48d3`, the reconciliation with 9b's board, inbox, agent session, and event stream operations, and the evidence session and 404 of D1 and D2.
- The first `make verify`, on the first routed head, failed in `npm run build`: the `packages/adapters/postgres` `tsconfig.json` lacked the `../secrets` reference of its new development dependency. Fixed in the PostgreSQL commit.
- `make verify` on `15bd48e7`: passed, profile full; tests 3205, pass 3190, fail 0, skipped 15; all files 99.41% lines, 92.63% branches, 99.08% functions. New files: `phc.js` and `csrf.js` 100% branches; `session-service.js` 91.01%, `principal-administration.js` 84.06%, `control-plane-api.js` 81.00%, `administration.js` 77.06% branches.
- `make verify` on `416f4325` (tree `2aeaf0d0`), after D1, D2, and the merge of `dev` `7efc48d3`: passed, profile full; tests 3250, pass 3235, fail 0, skipped 15; all files 99.47% lines, 92.63% branches, 99.08% functions. New files: `phc.js` and `csrf.js` 100% branches; `session-service.js` 91.01%, `control-plane-api.js` 84.47%, `principal-administration.js` 84.06%, `administration.js` 76.99% branches.

- `make verify` on `8cb12e14` (tree `901e05cd`), after the fixes of review pass 1: passed, profile full; tests 3260, pass 3245, fail 0, skipped 15; all files 99.47% lines, 92.64% branches, 99.06% functions. Changed files: `secret-input.js` and `request-log.js` 100% branches; `argon2id-password-hasher.js` 94.55%, `api-server.js` 93.41%, `session-service.js` 89.22%, `control-plane-api.js` 85.19% branches.
- `make verify` on `f9327406` (tree `b4d81d88`), after the fix of pass 1 finding 4: passed, profile full; tests 3261, pass 3246, fail 0, skipped 15; all files 99.47% lines, 92.65% branches, 99.06% functions. Changed file: `password-policy.js` 100% lines, branches, and functions.
- `make verify` on `e9b1c6c6` (tree `62f44a75`), after the fixes of review pass 2: the first run failed only in `test/installation-script.test.ts:452` ("a bound with a leading zero is read in base 10": "ended after 9.113s, before 10"), a timing test of the installation script that this change does not touch; the rerun on the same tree passed, profile full; tests 3268, pass 3253, fail 0, skipped 15; all files 99.47% lines, 92.67% branches, 99.06% functions. Changed files: `login-throttle.js` 100% branches, `access-repositories.js` 95.15%, `in-memory-access-store.js` 95.35%, `secret-input.js` 95.24%, `session-service.js` 90.00%, `control-plane-api.js` 85.19% branches.

## Merge of dev

- `a1f0d4af` merged `origin/dev` `10fc3bbe` (9b #394, 9c #395) without a textual conflict. `control-plane.openapi.json` 0.2.0 adds the board, inbox, agent session, and event stream operations; their rules follow wire contracts section 3 as 9b amended it, and `test/access-requirements.test.ts` lists them. The `answerableBy` check of `answerInboxItem` belongs to its handler (section 8).
- `execution.openapi.json` 0.6.0 and execution wire contracts section 8.2 answer an evidence read by a principal without a role on the record's project with the 404 of an unknown record, where this change answered 403 (Q4), and section 9 there assigns item 10 the session on the evidence operations, the retirement entry, the 404 of a download whose record was retired meanwhile, and an orphan content sweep. The coordinator decided (D1, D2, [design](design.md) "Coordinator decisions"): `readEvidence` and `downloadEvidence` now accept the session and answer a missing and a foreign record the same 404, which `test/browser-session.test.ts` shows by session and by bearer; `test/access-requirements.test.ts` checks their schemes against the execution document. The rest is a remaining gate below.
- `14f968d8` merged `origin/dev` `7efc48d3` (#396, `schedule-intent-and-council-gates`, documents and records only) without a conflict; the dependency inventory stayed current.
- `02805b7b`, after review pass 3, merged `origin/dev` `a10ceaaf` (#397, `run-reviews-through-make`: the review tooling under `scripts/`, its tests, the `review-process` living spec, `Makefile`, and protocol documents) without a conflict. It touches none of this change's requirements, contracts, implementation, or verification inputs (`scripts/findings-common.ts` only gains an `isRecord` helper), so the review evidence stays fresh; the dependency inventory stayed current.

## Limitations

- `retireEvidence`, the 404 of a download whose record was retired meanwhile, and the orphan content sweep are change 10b (D2, [design](design.md) "Non-goals").
- The G2 execution and SDLC documents declare no 403 on their operator operations, so a `role-required` denial there, other than on the evidence reads, which answer 404 (D1), answers 401 under the route's statuses; only the owner bearer reaches them until item 11, which the G2 bridge passes. Item 11 adds the 403, and the coordinator names it in item 11's brief. The `createRun` test serves the operation on a probe route with that 403.
- The reviewers ran at the brief's efforts, reviewer A `medium` and reviewer B `high`, not at the `high` and `xhigh` that `route.json` recommended, because governance does not authorize the routed effort (coordinator R1).
- `cookie@2.0.1` and `crypto.argon2` stay `candidate` in the dependency register with their notes (coordinator, 2026-10-28).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `62f44a75be886ecb744a219f116169874a446d9c`; tests 3268, pass 3253, fail 0, skipped 15; all files 99.47% lines, 92.67% branches, 99.06% functions.
- `npm run openspec -- validate implement-operator-login-and-roles --strict`: passed, `Change 'implement-operator-login-and-roles' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 73 file(s); every pass summary file is valid: 53 file(s); every route file is valid: 9 file(s).`.
- Spec diff against the merge base `7efc48d330b4` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a182da-e6a9-7210-84a5-8ab41618a5cf` | 0 | 1 | 7 | 0 |
| 2 | B | `claude claude-opus-5-5#high` | `3c7a6540-e2db-421d-bb86-e6cbcdd8a95f` | 0 | 0 | 3 | 6 |
<!-- make record: end -->

## Independent review

Passes 1 and 3 by reviewer A and pass 2 by reviewer B are below. The brief's efforts run, reviewer A Codex `gpt-6.1-sol` at `medium` and reviewer B Claude Code `claude-opus-5-5` at `high`, although `route.json` recommended `high` for reviewer A and `xhigh` for reviewer B, because governance does not authorize the routed effort (coordinator R1, 2026-10-28).

### Review pass 1

Reviewer A, Codex CLI 0.164.0, model `gpt-6.1-sol`, effort `medium` (the brief's; `route.json` recommended `high`), sandbox read-only, at `36a1ae5a`. Invocation: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt file>`. The session header confirmed the model, the effort, and the read-only sandbox; session `01a182da-e6a9-7210-84a5-8ab41618a5cf`. The working tree snapshot before and after the pass was the same (`7989577a695f41197b912100793aef9a6f3665ae53e280a6dd274883d4d8ae3d`), so the reviewer changed no file. It ran 52 tests and `verify:comments`, which passed; the HTTP suite could not listen in its sandbox (`EPERM`), and it ran neither `make verify` nor the PostgreSQL suites.

Findings: 0 Critical, 1 High, 7 Medium, 0 Low, as `findings.jsonl` records them. Each fix has a test that fails before it and passes after it, run on the built workspace before and after the fix.

- **H1 (concurrency-race), `a0405509`.** A login read the principal and its hash before the slow verification and outside the rotation, so a `set-password` that finished meanwhile could not stop it, and a due rehash wrote the old password over the new one. The rotation transaction now rereads the principal and refuses the login with `login-failed` unless it is enabled and still has the verified hash. Two tests change the password while a gated verification waits, against a current and a rehash-due hash.
- **M1 (concurrency-race), `a0405509`.** The rotation now rereads the session and answers `unauthenticated` unless it is still live; a test expires the anonymous session while the verification waits.
- **M2 (contract-drift), `b466cd50`.** `submitTask` checked its run's project after the body. A `resource-project` rule now names where its project is, `path-resource` or `body`, and the server calls `ApiHandlers.authorizeResource` before the body, so only `createRun` checks its role after the body, as wire contracts section 2 allows. A session probe of `submitTask` with an invalid body gets the 403 `role-required` for a foreign and an unknown run alike.
- **M3 (contract-drift), `cdf5cb67`.** The schema of `LoginRequest` counts `Password.maxLength` before NFC, so a password of up to 1024 characters after NFC could be refused at login when sent decomposed. Coordinator decision (c) keeps the contract: `checkNewPassword` also refuses a password whose NFD form has more than 1024 code points. The `ajv` validator of `@taskelith/contracts` keeps its default `unicode` option, so `maxLength` counts code points, and the policy counts the same way. A test that fails before the fix sets 1024 emoji, sets 512 `é`, whose NFD has 1024 code points, and is refused 513.
- **M4 (contract-drift), `6172ede0`.** An unknown name cost one computation at the current parameters, a wrong password for a legacy hash only its weaker ones. A failed verification now lasts at least the last measured cost at the current parameters, and computes one when none was measured yet. A test with a fake whose cost is memory times passes shows the same cost for an unknown name and a current and a legacy hash.
- **M5 (redaction), `643c7c8a`.** The request log kept every query parameter. Routes now declare the query parameters of their document (`listQuarantine`: `from`), and the log keeps only those, still redacted; a test checks every route against the documents, and wire contracts section 7 names the declared query parameters. Unit and HTTP tests show that a password and unprefixed tokens in the query are not logged.
- **M6 (error-handling), `c30fddee`.** The secret reader decoded each chunk alone. A `StringDecoder` now decodes across chunks; a test splits a line at every byte.
- **M7 (error-handling), `c30fddee`.** Ctrl-C ended the line as if confirmed. It now answers a `cancelled` failure after the terminal mode is restored, and `set-password` writes nothing; a unit test checks the modes, and the PostgreSQL test checks that the hashes, the audit trail, and the sessions are unchanged.

Route: not routed again. Worker step 4 asks for a new route only when the fixes of the `make verify` run before pass 1 change the diff, not after review fixes, as pass 2 of `route-reviewers-by-change-complexity` found (its finding 5).

### Review pass 2

Reviewer B, Claude Code, model `claude-opus-5-5`, effort `high` (the brief's; `route.json` recommended `xhigh`), permission mode `plan` with the editing tools disallowed, at `b3d111d7`. Invocation: `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`. The last result line of the log confirmed the model in `modelUsage`, subtype `success`, session `3c7a6540-e2db-421d-bb86-e6cbcdd8a95f`. The working tree snapshot before and after the pass was the same (`c783c50f26818f99842524b4f4835f16cf103d9a462bf0f63971b25edc7cbf54`), so the reviewer changed no file. It ran `git fetch origin dev` to find the merge base, which updated remote refs only, `git diff`, `jq`, and `npm run verify:comments`, which passed; it ran neither `make verify` nor the PostgreSQL suites.

It confirmed all eight pass 1 fixes. New findings: 0 Critical, 0 High, 3 Medium, 6 Low, as `findings.jsonl` records them. Pass 3 reviewed the fixes. Each behaviour change has a test that fails before it, run on the built workspace before and after the fix.

- **M-1 (concurrency-race), `55d9d5fa`.** Parallel attempts all passed the throttle before any failure was recorded, so one client could keep the hash queue full and make every login answer 503, and the bound of 10 000 keys forgot the oldest, so failures on other names reset a target's counter. `LoginThrottle.attempt` now runs attempts one at a time per source address and per login name, in that order, waiting the delay inside that turn while a key is throttled, so one address holds at most one hash slot. An address with 4 attempts waiting or running gets 503 `unavailable` at once; there is no new status, no contract change, and no lockout (Q8). Keys with a failure in the window are never forgotten: expired keys are dropped, and while the table is full a key it cannot hold is delayed as if throttled. Before the fix, six parallel attempts from one address ran their verifications together and the two beyond four never answered (the test timed out), and filling the table reset the target.
- **M-2 (error-handling), `5dec6d54`.** On a terminal, backspace and delete drop the last code point, Ctrl-U clears the line, Ctrl-D ends only an empty line, as a cancel, and any other C0 control key, escape sequences included, refuses the input with reason `control-character`. `set-password` reads the password through `readConfirmedSecret`, which on a terminal asks twice and refuses differing entries with reason `entries-differ`; piped input is read once, as before. Before the fix the editing tests failed.
- **M-3 (spec-wording), `da1de3d3`.** The deltas add "Login throttling without lockout", "Provisional session lifetimes", and "Run resources deny unknown and foreign alike" to `control-plane-api`, and "A password change ends the principal's sessions" and "Temporary G2 bridge" to `trust-and-operational-foundation`, each with a scenario that an existing or new test covers. Each requirement is under 500 characters, and `npm run verify:archive` archives the change in a scratch copy into strictly valid specs.
- **L-1 (contract-drift), `bce0bf40`.** A test reads `Password.maxLength` from `control-plane.openapi.json`, compares it with `PASSWORD_POLICY.maximumCodePoints`, and checks the NFC and NFD forms of 512 `é` and of 1024 astral characters against the `LoginRequest` schema.
- **L-2 (concurrency-race), `953113c9`.** A PostgreSQL test holds the rotation transaction after its principal read while another pool commits a password change that ends the principal's sessions; the login answers `login-failed`, the new hash stays, and no session is logged in.
- **L-3 (stale-citation), this record.** The status line names both passes, and tasks 6.2 and 6.3 are checked.
- **L-4 (error-handling), `953113c9`.** The adapter reads the `kind` column and answers `internal` for an unknown kind; a PostgreSQL test drops the check, inserts a `delegate` row, and restores the check.
- **L-5 (naming), `953113c9`.** The two imports from `@taskelith/access` are one, and the session port exposes `start()`, now public on `SessionService`, instead of `read(undefined)`.
- **L-6 (error-handling), `953113c9`.** `trimAnonymous(cap, limit)` deletes at most the purge batch, oldest first, on both stores; the conformance suite checks the limit.

### Review pass 3

Reviewer A, Codex CLI 0.164.0, model `gpt-6.1-sol`, effort `medium` (the brief's; `route.json` recommended `high`), sandbox read-only, at `c596918f`, governed by "Conditional third pass" because the pass 2 fixes change code. Invocation: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt file>`. The session header confirmed the model, the effort, and the read-only sandbox; session `01a1831e-c5b9-7d01-9669-dd1adba23a73`. Scope: `b3d111d7..c596918f` only, to confirm the pass 2 fixes, with no new scope. The worktree snapshot before and after the run was the same, `8c3525f9b071e44c1ac35ddf5a8faf0a4ee3c7b1ae82de9f2d709ccb84e140c8`, so the reviewer changed nothing.

The reviewer ran 57 tests of the fixes, all passing, and `npm run verify:comments`, which passed; it checked the PostgreSQL tests by reading the code, without running them. Verdicts, each "correct and complete, no new defect":

- **M-1.** Attempts run one at a time per login name and per source address, the queue per address is bounded, live counters are kept, and there is no hard lockout or new status; the parallel and full-table tests fail before the fix and pass after it.
- **M-2.** Terminal line editing, the refusal of control keys, and the confirmed second entry are correct; the editing tests tell the old behaviour apart.
- **M-3.** The five added requirements and their scenarios match the decisions and the contracts; no fail-before test applies to a spec fix.
- **L-1.** The test ties `PASSWORD_POLICY` to `Password.maxLength` and checks the largest NFC and NFD values through the login schema; it adds coverage, so it also passes before.
- **L-2.** The PostgreSQL test drives the race with a barrier and checks the refusal, the kept new hash, and that no session is logged in; it adds coverage.
- **L-3.** The status line and the tasks matched the state after pass 2; a records fix.
- **L-4.** The adapter reads `kind` and refuses an unknown value; the PostgreSQL test expects `internal` on both read paths, where the old code answered `operator`.
- **L-5.** One import and the explicit `start()` port; a refactoring without behaviour change.
- **L-6.** Both stores delete at most the batch, oldest first; the conformance test expects one deletion where the old code made two.

New findings: 0 Critical, 0 High, 0 Medium, 0 Low, matching its `passes.jsonl` line; `findings.jsonl` gains no line. No fix followed, so no further pass runs (at most three passes).

## Remaining gates

- The temporary G2 bridge, under which an `installation-owner` passes the project requirements of the G2 operator operations, is retired by item 11 ([design](design.md) decision 6, Q5).
- Follow-up contract change `add-account-self-service-operations`, planned by the coordinator before item 28: account self-service HTTP operations, the browser first run, and the caller's project roles (Q1, Q2, Q12).
- Change 10b: `retireEvidence`, the 404 of a download whose record was retired meanwhile, and the sweep of evidence content whose digest no record refers to (Q13, D2; execution wire contracts section 9).
- The other operations of execution wire contracts section 8.1, by the items that own their handlers (D2): `listUnknownExecutions`, `listUnrecordedProcesses`, and `readmitTask` item 44; `readDelegationResult` item 38; `fetchSlotCredential` item 12; `issueRunScmCredential` and `fetchRunScmCredential` item 21.
- Item 11: the 403 on the operator operations of the G2 execution and SDLC documents, named in its brief.
- Integration into dev by the coordinator (single pull request)

## Archive checks

Run on the tree of the archive commit, the archive of `02805b7b` on merge base `a10ceaaf` with `origin/dev`, on 2026-10-28:

- `npm run openspec -- archive implement-operator-login-and-roles --yes`: archived as `2026-10-28-implement-operator-login-and-roles`; `control-plane-api` 7 added and `trust-and-operational-foundation` 6 added (`+ 13, ~ 0, - 0, → 0`).
- `npm run openspec -- validate --all --strict`: `Totals: 71 passed, 0 failed (71 items)`.
- `npm run openspec -- validate --archived --no-interactive`: 234 passed, 14 failed; this change passes, and the 14 are older archived changes, none of them added by this change.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/control-plane-api/spec.md` (93 insertions) and `openspec/specs/trust-and-operational-foundation/spec.md` (70 insertions), the 13 added requirements of the deltas and nothing removed.
- The moved change has `findings.jsonl` (17 lines) and `passes.jsonl` (3 lines); `make findings ARGS="validate"`: 74 findings files, 54 pass summary files, and 10 route files valid.
- `make verify`, profile full, on the archive working tree before the commit, which differs from the archive commit's tree only in this section: the first run failed only in `test/installation-script.test.ts:452` ("a bound with a leading zero is read in base 10": "ended after 9.101s, before 10"), the timing test that this change does not touch and that failed the same way after the pass 2 fixes; the rerun passed: tests 3302, pass 3287, fail 0, skipped 15; all files 99.47% lines, 92.66% branches, 99.06% functions. It wrote no stamp, because the tree was uncommitted; the `pre-push` hook verifies the committed archive tree.
- The generated part above stays the `make record` of `e9b1c6c6`; `passes.jsonl` and the review sections record pass 3.
