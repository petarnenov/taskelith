# Verification: implement-operator-login-and-roles

Status: implemented and verified by the author; independent review pending.

## Scope and source

- G3 item 10 ([G3 work plan](/docs/g3-plan.md), row 10, decision D2 (a)), size M-L, commit type `chore`, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent from `dev` `a3a0ac4c`.
- Sources and exclusions: [design](design.md) "Context" and "Sources".

## Revision

- Base: `dev` `a3a0ac4c`.
- Verified head: `15bd48e7` (tree `a8aad919`), commits `823b92de` to `15bd48e7` on the branch.

## Environment

macOS x86_64 (2020 Intel iMac), Node.js 24.22.1 through the `.nvmrc` pin, Docker Desktop for the `make test` services.

## Author self-check

Review checklist (`checklist.json`):

- **contract-drift.** `test/access-requirements.test.ts` reads `control-plane.openapi.json`: every operation has its own rule, each matches its wire contracts section 3 row, and the served 9a routes accept exactly the document's security alternatives. `details.requiredRole` is accepted unchanged by `AccessDenial` (`additionalProperties` of type string), so no schema changes; wire contracts section 2 now names it (Q10).
- **missing-fail-before-test.** The change adds behaviour rather than fixing a defect; the session, CSRF, and role tests fail before it, because `/session` had no route and the server checked no role.
- **docs.** `design.md` records that `createRun` is checked after its body is validated, and that the G2 documents declare no 403 on the operator operations, which only the owner bearer reaches until item 11. The dependency register notes the use of `cookie@2.0.1` and `crypto.argon2`; both stay `candidate`, as the register has no `adopted` status.
- **naming.** One term per concept: principal, installation role, project role, session, requirement, rule.
- **error-handling.** A store failure is 503, never a refused credential; an unknown operation fails closed to `installation-owner`.
- **spec-wording.** The deltas follow the coordinator decisions Q1 to Q13.
- **concurrency-race.** Owner creation under two concurrent pools is tested against PostgreSQL; the in-memory store serializes its transactions.
- **redaction.** Tests show that no log line, failure body, or audit event holds a password, session identifier, CSRF token, or the operator bearer, and that a body breaking the login schema names no password.

ADR 0004: hexagonal ports in `@taskelith/access` with in-memory and PostgreSQL adapters under one conformance suite; the hasher in `@taskelith/secrets`; contract-first (the document drives the requirement tests); Makefile-driven checks; coverage below.

## Checks

- `env -u JEV_MAF_LAB make findings ARGS="route --change implement-operator-login-and-roles"`: elevated (lines, files, security, contracts, size), rule version 1; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow failed (`missing-credential`). The first `route.json`, on `d8a2a0e3`, was routed again on `ac79878f`, because the fix below changed the diff.
- The first `make verify`, on the first routed head, failed in `npm run build`: the `packages/adapters/postgres` `tsconfig.json` lacked the `../secrets` reference of its new development dependency. Fixed in the PostgreSQL commit.
- `make verify` on `15bd48e7`: passed, profile full; tests 3205, pass 3190, fail 0, skipped 15; all files 99.41% lines, 92.63% branches, 99.08% functions. New files: `phc.js` and `csrf.js` 100% branches; `session-service.js` 91.01%, `principal-administration.js` 84.06%, `control-plane-api.js` 81.00%, `administration.js` 77.06% branches.

## Limitations

- The evidence retirement entry is deferred until its 9b to 9d operation lands in `dev` ([design](design.md) "Non-goals").

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a8aad919696150b929aab308d1d627e2b192240d`; tests 3205, pass 3190, fail 0, skipped 15; all files 99.41% lines, 92.63% branches, 99.08% functions.
- `npm run openspec -- validate implement-operator-login-and-roles --strict`: passed, `Change 'implement-operator-login-and-roles' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 70 file(s); every pass summary file is valid: 50 file(s); every route file is valid: 6 file(s).`.
- Spec diff against the merge base `a3a0ac4cea7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending: pass 1 by reviewer A, pass 2 by reviewer B.

## Remaining gates

- The temporary G2 bridge, under which an `installation-owner` passes the project requirements of the G2 operator operations, is retired by item 11 ([design](design.md) decision 6, Q5).
- Follow-up contract change `add-account-self-service-operations`, planned by the coordinator before item 28: account self-service HTTP operations, the browser first run, and the caller's project roles (Q1, Q2, Q12).
- Change 10b: the evidence retirement entry once its 9b to 9d operation is in `dev` (Q13).
- Review passes.
- Integration into dev by the coordinator (single pull request)
