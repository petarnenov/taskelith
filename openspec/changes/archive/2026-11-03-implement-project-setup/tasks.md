## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`
- [x] 1.2 Write the design with the coordinator's decisions Q1 to Q3

## 2. Access module

- [x] 2.1 Domain: projects, defaults, settings with revisions, and the minted project identifier
- [x] 2.2 Port: the `Projects` store and member pages, with conformance cases and the in-memory adapter
- [x] 2.3 Services: `ProjectSetupService` and the member commands of `PrincipalAdministration`

## 3. Adapters

- [x] 3.1 PostgreSQL migration `1792933800000` and the `Projects` store, run against the conformance cases
- [x] 3.2 `NodeSecrets.projectId`

## 4. Control plane

- [x] 4.1 The ten routes, their handlers, and the wire mapping; composition

## 5. Tests

- [x] 5.1 Module, conformance, migration, and HTTP tests of the design's test plan, with fail-before evidence

## 6. Verification and review

- [x] 6.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 6.2 Review pass 1 by reviewer A, and its fix round with the coordinator's decisions (a) to (c)
- [x] 6.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [x] 6.4 Review pass 3 by reviewer A, which governance "Review sequence" runs when pass 2 reports a Medium-or-higher finding (not needed: pass 2 reported only Low findings)

## 7. Archive

- [x] 7.1 Archive the change in the last commit of the branch and record the archive checks
