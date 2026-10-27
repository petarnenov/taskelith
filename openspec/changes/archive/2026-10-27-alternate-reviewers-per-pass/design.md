## Context

The owner approved the mixed option on 2026-10-27, relayed by the coordinator (Niki): pass 1 by reviewer A, a full review; pass 2 by reviewer B of another harness, a full, independent review that also checks the pass 1 fixes; pass 3 by reviewer A, confirming only the pass 2 fixes. The three-pass cap, the Low-only rule, and the unavailable-reviewer rule stay.

## Decisions

1. **Roles, not names.** The rule speaks of reviewer A and reviewer B. A role stays with the task when its reviewer is replaced, so the scope of each pass does not depend on who makes it.
2. **Replacement keeps the harness split.** A replacement must have a harness different from the task's other reviewer, unless decision 7 applies: from B's when it replaces A, from A's when it replaces B. It takes the role's remaining passes with their scope: a replacement of A before pass 1 makes the full pass 1, one of B makes pass 2, and one of A after pass 2 only confirms the pass 2 fixes. The old rule had the replacement's first pass confirm the earlier findings and then review the whole task; under the new rule pass 2 already does both, and a full review in pass 3 would add the new scope that the owner excluded.
3. **Rotation.** A is the reviewer whose turn it is; B is the next reviewer in the turn whose harness differs from A's, unless decision 7 applies, and B then counts as the most recently assigned. The list already keeps reviewers of one harness apart, so B is normally the entry right after A. B is assigned in the brief even if a Low-only pass 1 means it is never used, so the coordinator need not revisit the turn mid-task.
4. **Assigned reviewer without a pass.** Rules that name "the assigned reviewer" outside the pass sequence, chiefly the review of a returned branch (agent task protocol step 10 and the `agent-task-protocol` requirement "Return and re-archive"), mean reviewer A. Governance states this once, and the protocol, the skill, and the governance "Close" row now say reviewer A, so the `agent-task-protocol` capability needs no delta.
5. **Transition.** Policy version 5 applies to tasks briefed after it reaches `dev`. The boundary is the moment version 5 reaches `dev`, and the rule names no date (coordinator Niki, 2026-10-27). A task briefed before, including one already in review, finishes under version 4's one-reviewer rule, whose text governance keeps in the "Tasks under the previous rule" entry and the spec in "Changes under the one-reviewer rule".
6. **Requirement length.** Each changed requirement body stays under 500 characters (491, 490, 490, 485, and 358), and the archive was tested in a scratch copy, because longer ones fail strict validation only after the archive.
7. **No reviewer of another harness** (coordinator Niki, 2026-10-27). When no reviewer of a harness different from the task's other reviewer is available, that is, not paused or unavailable and meeting the task's review requirements, the coordinator may assign a different model of the same harness, as reviewer B or as a replacement, and records the reason in `verification.md`. The rule stands in its own requirement, because adding it to "Unavailable reviewer" or "Rotation order" would take their bodies past 500 characters.
8. **Living spec Purpose edited directly** (coordinator Niki, 2026-10-27). The pinned OpenSpec archive applies requirement deltas but leaves a living spec's Purpose untouched, so the Purpose of `openspec/specs/review-process/spec.md`, which said "one reviewer per change at a time", is edited in this change to describe the two alternating reviewers. The scratch archive test confirms that the archive keeps the edited Purpose.
9. **UI POC badge** (coordinator Niki, 2026-10-27). The Reviews screen's badge "One reviewer per task" reads "Reviewers A and B per task". The published UI POC artifact is not rebuilt.

## Findings tooling

No change is needed: nothing in the tooling assumes one reviewer per change.

- `docs/review-findings/finding.schema.json:20` defines `reviewer` per line, and `:14`-`:19` bound `pass` to 1 to 9 per line, with no relation to other lines.
- `scripts/review-findings.ts:113` (`parseLine`) validates each line alone, and `:137` (`recordProblems`) checks only that the line's change matches its file and that its category is known; no check compares the reviewer or pass across lines.
- `scripts/findings.ts:215`-`:216` parses each file line by line through `parseFindings`; no rule spans lines of a change.
- `scripts/review-findings.ts:207` (`reviewerKey`), `:215` (the `reviewer` dimension), `:218` (`tallyBy`), and `:236` (the `reviewer` index) tally the index by each line's own reviewer, so passes by A and B of one change count under their own reviewers.
- `test/review-findings.test.ts:253`-`:259` (the `archive` fixture) already holds findings of one change (`demo-change`) from two reviewers, the second at `:256`, and `:270` asserts both in the reviewer index.

## Risks

- A same-harness fallback under decision 7 loses the harness split for that task; `verification.md` records the reason, so such tasks can be found.
