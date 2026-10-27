## 1. Contract and spec

- [x] 1.1 Derive workspace and task branch names in `docs/contracts/git-workspace.md` sections 2, 3, 4, 9, 12, 13, and 14, and drop the item 9 minting obligation
- [x] 1.2 Add the `git-workspace-port` delta: the name derivation requirement and the modified layout, prepare refusal, task branch, and conformance suite requirements

## 2. Code and tests

- [x] 2.1 Derive names in the `@taskelith/workspace` domain with a Node-free SHA-256 (superseded by 6.2), add `WORKSPACE_NAME_RULES`, and remove `unsafe-name`
- [x] 2.2 Replace the suite's unsafe-name rows with the name derivation case, and make the test double derive its names, keep the attempt identifier in its record, and carry the four new defects
- [x] 2.3 Domain tests for the form, safety, determinism, Git branch validity, shared prefixes, and the digest, with a fail-before run on the pre-change code

## 3. Verification and review

- [x] 3.1 Run `make verify`, the strict validation of the change, and `make findings ARGS="validate"`
- [x] 3.2 Independent review under the governance process: pass 1 by reviewer A, pass 2 by reviewer B, and pass 3 by reviewer A unless pass 2 finds nothing above Low
- [x] 3.3 Record the review evidence in `verification.md`, `findings.jsonl`, and `passes.jsonl`

## 4. Review pass 1

- [x] 4.1 Fix the two pass 1 findings: the working directory check in the name derivation case with a defective double that fails it, and the design's collision example

## 5. Review pass 2

- [x] 5.1 Fix the six pass 2 Low findings without another review: the removal of every workspace in the name derivation case with a defective double that fails it, the canonical data root, the defect count, the order and heads of the recorded checks, Web Crypto in design D5, and the identifier wording of the contract

## 6. Coordinator return

- [x] 6.1 Restore the active change by reverting the archive commit; `origin/dev` had not advanced past `93b5065b`, so no merge or delta reconciliation was needed
- [x] 6.2 Fix the coordinator's finding: remove the hand-written `sha256.ts` and its tests, inject an `IdentifierDigest` that the double supplies with `node:crypto`, and add the fixture's digest, a conformance case with SHA-256 vectors, and two defective doubles that fail it
- [x] 6.3 Update the contract, the spec delta, the design D5, the proposal, and `verification.md`, and run `make verify`, the strict validation, `make findings ARGS="validate"`, and `npm run verify:links`
- [ ] 6.4 Review pass 3 by reviewer A confirming the fix of the coordinator's finding, then archive again
