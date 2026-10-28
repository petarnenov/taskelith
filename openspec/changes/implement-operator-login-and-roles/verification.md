# Verification: implement-operator-login-and-roles

Status: implemented and verified by the author; independent review pending.

## Scope and source

- G3 item 10 ([G3 work plan](/docs/g3-plan.md), row 10, decision D2 (a)), size M-L, commit type `chore`, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent from `dev` `a3a0ac4c`.
- Sources and exclusions: [design](design.md) "Context" and "Sources".

## Revision

- Base: `dev` `a3a0ac4c`.
- Verified head: `416f4325` (tree `2aeaf0d0`), commits `823b92de` to `416f4325` on the branch, with the merges of `dev` `10fc3bbe` and `7efc48d3`.

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

## Merge of dev

- `a1f0d4af` merged `origin/dev` `10fc3bbe` (9b #394, 9c #395) without a textual conflict. `control-plane.openapi.json` 0.2.0 adds the board, inbox, agent session, and event stream operations; their rules follow wire contracts section 3 as 9b amended it, and `test/access-requirements.test.ts` lists them. The `answerableBy` check of `answerInboxItem` belongs to its handler (section 8).
- `execution.openapi.json` 0.6.0 and execution wire contracts section 8.2 answer an evidence read by a principal without a role on the record's project with the 404 of an unknown record, where this change answered 403 (Q4), and section 9 there assigns item 10 the session on the evidence operations, the retirement entry, the 404 of a download whose record was retired meanwhile, and an orphan content sweep. The coordinator decided (D1, D2, [design](design.md) "Coordinator decisions"): `readEvidence` and `downloadEvidence` now accept the session and answer a missing and a foreign record the same 404, which `test/browser-session.test.ts` shows by session and by bearer; `test/access-requirements.test.ts` checks their schemes against the execution document. The rest is a remaining gate below.
- `14f968d8` merged `origin/dev` `7efc48d3` (#396, `schedule-intent-and-council-gates`, documents and records only) without a conflict; the dependency inventory stayed current.

## Limitations

- `retireEvidence`, the 404 of a download whose record was retired meanwhile, and the orphan content sweep are change 10b (D2, [design](design.md) "Non-goals").
- The G2 execution and SDLC documents declare no 403 on their operator operations, so a `role-required` denial there, other than on the evidence reads, which answer 404 (D1), answers 401 under the route's statuses; only the owner bearer reaches them until item 11, which the G2 bridge passes. Item 11 adds the 403, and the coordinator names it in item 11's brief. The `createRun` test serves the operation on a probe route with that 403.
- `cookie@2.0.1` and `crypto.argon2` stay `candidate` in the dependency register with their notes (coordinator, 2026-10-28).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `2aeaf0d0b49aae6e38bdf1c18bc96f81809eed1e`; tests 3250, pass 3235, fail 0, skipped 15; all files 99.47% lines, 92.63% branches, 99.08% functions.
- `npm run openspec -- validate implement-operator-login-and-roles --strict`: passed, `Change 'implement-operator-login-and-roles' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 73 file(s); every pass summary file is valid: 53 file(s); every route file is valid: 9 file(s).`.
- Spec diff against the merge base `7efc48d330b4` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending: pass 1 by reviewer A, pass 2 by reviewer B. The brief's efforts run, reviewer A Codex `gpt-6.1-sol` at `medium` and reviewer B Claude Code `claude-opus-5-5` at `high`, although `route.json` recommended `high` for reviewer A and `xhigh` for reviewer B, because governance does not authorize the routed effort (coordinator R1, 2026-10-28).

## Remaining gates

- The temporary G2 bridge, under which an `installation-owner` passes the project requirements of the G2 operator operations, is retired by item 11 ([design](design.md) decision 6, Q5).
- Follow-up contract change `add-account-self-service-operations`, planned by the coordinator before item 28: account self-service HTTP operations, the browser first run, and the caller's project roles (Q1, Q2, Q12).
- Change 10b: `retireEvidence`, the 404 of a download whose record was retired meanwhile, and the sweep of evidence content whose digest no record refers to (Q13, D2; execution wire contracts section 9).
- The other operations of execution wire contracts section 8.1, by the items that own their handlers (D2): `listUnknownExecutions`, `listUnrecordedProcesses`, and `readmitTask` item 44; `readDelegationResult` item 38; `fetchSlotCredential` item 12; `issueRunScmCredential` and `fetchRunScmCredential` item 21.
- Item 11: the 403 on the operator operations of the G2 execution and SDLC documents, named in its brief.
- Review passes.
- Integration into dev by the coordinator (single pull request)
