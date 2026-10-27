## 1. Contract and spec

- [x] 1.1 Scan every archived `findings.jsonl` and `passes.jsonl` for reviewer spellings and record them in `design.md`.
- [x] 1.2 Add the `review-process` requirements "Canonical reviewer key" and "Reviewer assignment", modify "Authorized alternating reviewers", "Rotation order" (with the new scenario "Replacement from the rotation"), "Unavailable reviewer", and "No reviewer of another harness" (with the new scenario "Barred reviewer of another harness"), and validate the change strictly.

## 2. Tests first

- [x] 2.1 Tests of `make findings` that fail before the change: `validate` rejects each non-canonical key of an active change by file and line, and `reviewers` and `index` count each of the three legacy spellings under its canonical key.
- [x] 2.2 Unit tests of `scripts/reviewer-keys.ts`: every alias, every canonical harness, and every message.

## 3. Implementation

- [x] 3.1 `scripts/reviewer-keys.ts` with the rule and `LEGACY_REVIEWER_ALIASES`.
- [x] 3.2 `scripts/findings.ts` checks the key in active changes and reads archived records through the aliases; the finding schema's descriptions name the canonical key.

## 4. Documents

- [x] 4.1 `docs/governance.md`: the owner's "Reviewer assignment" under "Two alternating reviewers per task", reconciled "Rotation" and "Unavailable reviewer".
- [x] 4.2 `docs/agent-task-protocol.md`, `.claude/skills/taskelith-task-protocol/SKILL.md`, and `.claude/skills/taskelith-coordinator/SKILL.md` point to it; the protocol's "Review findings record" states the key rule and the aliases.

## 5. Verify and review

- [x] 5.1 Run `npm run openspec -- validate normalize-reviewer-keys --strict` and `make verify`, and record them in `verification.md`.
- [x] 5.2 Review pass 1 by reviewer A, and its fixes.
- [x] 5.3 Review pass 2 by reviewer B, and its Low fixes.
- [x] 5.4 Review pass 3 by reviewer A, if pass 2 has findings above Low: not needed, pass 2 was Low-only.
- [ ] 5.5 Review of the merge of dev (`579c227d`) by reviewer A: the resolved diff and the delta reconciliation.
- [ ] 5.6 Archive the change.
