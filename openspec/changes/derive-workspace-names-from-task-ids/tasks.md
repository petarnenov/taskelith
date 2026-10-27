## 1. Contract and spec

- [x] 1.1 Derive workspace and task branch names in `docs/contracts/git-workspace.md` sections 2, 3, 4, 9, 12, 13, and 14, and drop the item 9 minting obligation
- [x] 1.2 Add the `git-workspace-port` delta: the name derivation requirement and the modified layout, prepare refusal, task branch, and conformance suite requirements

## 2. Code and tests

- [x] 2.1 Derive names in the `@taskelith/workspace` domain with a Node-free SHA-256, add `WORKSPACE_NAME_RULES`, and remove `unsafe-name`
- [x] 2.2 Replace the suite's unsafe-name rows with the name derivation case, and make the test double derive its names, keep the attempt identifier in its record, and carry the two new defects
- [x] 2.3 Domain tests for the form, safety, determinism, Git branch validity, shared prefixes, and the digest, with a fail-before run on the pre-change code

## 3. Verification and review

- [x] 3.1 Run `make verify`, the strict validation of the change, and `make findings ARGS="validate"`
- [ ] 3.2 Independent review under the governance process: pass 1 by reviewer A, pass 2 by reviewer B, and pass 3 by reviewer A
- [ ] 3.3 Record the review evidence in `verification.md`, `findings.jsonl`, and `passes.jsonl`
