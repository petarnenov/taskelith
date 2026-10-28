## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`
- [x] 1.2 Write the design with the coordinator questions
- [x] 1.3 Apply the coordinator's answers to the design and the spec deltas

## 2. Access module

- [x] 2.1 Domain: principals, roles and ranks, sessions, password policy, and requirements
- [x] 2.2 Ports with conformance suites and in-memory adapters: principals, project roles, sessions, password hasher, access audit, approvers
- [x] 2.3 Services: sessions, authorization, owner bootstrap, principal administration, role approvers

## 3. Adapters

- [x] 3.1 Argon2id hasher over `crypto.argon2` with the PHC codec and the start check
- [x] 3.2 PostgreSQL migration and repositories, run against the conformance suites

## 4. Control plane

- [x] 4.1 Route alternatives and role requirements derived from the document; the session operations on the browser endpoint
- [x] 4.2 Authentication, CSRF, role, and body order; cookies and `no-store`; request log allowlist
- [x] 4.3 Per-project authorization of `readEvidence` and `downloadEvidence`
- [x] 4.4 Owner creation at `init` and start, administrative password and role commands, session purge loop

## 5. Tests

- [x] 5.1 Unit, conformance, HTTP, and redaction tests of the design's test plan, at least 75% lines, branches, and functions

## 6. Verification and review

- [ ] 6.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [ ] 6.2 Review pass 1 by reviewer A, including conformance to the proof of concept's sign-in flow
- [ ] 6.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [ ] 6.4 Review pass 3 by reviewer A, if governance "Conditional third pass" requires it

## 7. Archive

- [ ] 7.1 Archive the change in the last commit of the branch and record the archive checks
