# Verification: alternate-reviewers-per-pass

## Scope and source

Coordinator brief from Niki, which the owner approved on 2026-10-27 as the mixed option: replace "One reviewer per task" with two alternating reviewers per task, reviewer A for the full pass 1 and the confirmation-only pass 3, and reviewer B, of a different harness, for the full, independent pass 2 that also checks the pass 1 fixes. Assigned by the coordinator Niki; developed by subagents briefed and checked by the worker session Desi, under [subagent execution](../../../docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/alternate-reviewers-per-pass` on branch `alternate-reviewers-per-pass`. Base revision: `744689cb` on `dev`. Scope: `docs/governance.md`, `docs/agent-task-protocol.md`, the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills, the review line of `AGENTS.md`, the `review-process` delta and the living spec's Purpose, the UI POC's Reviews badge and its README's published-build note, and a check of the findings tooling. Exclusions: review-pass statistics (a later `review-pass-statistics` change), a rebuild of the published UI POC artifact, and the findings schema and scripts, which need no change (`design.md`). Commit types `docs` and `chore`: nothing here is in the published package's `files` allowlist.

## Coordinator decisions

The coordinator Niki decided on 2026-10-27, after the first round of this change:

1. The living `review-process` Purpose is edited directly in this change, because the archive leaves a Purpose untouched (`design.md` decision 8).
2. When no reviewer of a harness different from the task's other reviewer is available, the coordinator may assign a different model of the same harness and records the reason in `verification.md`, for a replacement and for reviewer B (`design.md` decision 7; the "No reviewer of another harness" requirement).
3. The UI POC badge "One reviewer per task" reads "Reviewers A and B per task" (`design.md` decision 9).
4. This change, briefed before version 5 reaches `dev`, is a coordinator-authorized pilot of version 5 (see "Independent review").
5. The transition rule names no date: "A task briefed before version 5 reached `dev`" (`design.md` decision 5).
6. This record names the worker session Desi as the developer and records the `dev` merge below.

## Revision

Rule text and change records: `52049334` and `8914f3dc` on base `744689cb`, and the first verification record `58bd811b`. Merge `a4f223d0` merged `origin/dev` at `9c0c1706`, which brought pull request #334 (`require-finding-capability`). Its conflicts in `docs/agent-task-protocol.md` worker steps 5 and 6, `.claude/skills/taskelith-coordinator/SKILL.md`, and `.claude/skills/taskelith-worker/SKILL.md` were resolved by keeping both `dev`'s capability and record-quality wording and this change's A and B wording. The coordinator decisions above are in the commits after `a4f223d0`, up to `18da6cde`, which review pass 1 and `make verify` ran on. Review pass 1 fixes: `ba93fa1e`; their record `e1781486`, which review pass 2 ran on. Review pass 2 fixes: `9894a699`; their record `d811a69e`. Merge `bc6683a3` merged `origin/dev` at `0864892f` (#336) without touching this change's files; the `make verify` record `07fd1c01` followed, which review pass 3 ran on. Review pass 3 fix: `b77e2e97`; its record follows it.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`.

## Author self-check

Against the review checklist of the brief (`make findings ARGS="checklist --capability review-process --files docs/**,.claude/**"`) and ADR 0004:

1. Redaction: no credential, token, or local path beyond the repository's worktree convention is added; `findings.jsonl` was empty before the review.
2. Contract drift: governance, the protocol, the three skills, `AGENTS.md`, and the delta state the same rule. The author searched for `one reviewer`, `reviewer per task`, `same reviewer`, `cross-review`, and `assigned reviewer` across `docs/`, `.claude/`, `AGENTS.md`, and `openspec/specs/`. Remaining hits after the coordinator decisions: the governance version history and the version 4 rule kept for tasks already under it, and the `agent-task-protocol` spec's "assigned reviewer" of a returned branch, which governance now defines as reviewer A.
3. Docs: links resolve to existing anchors (`governance.md#independent-review-process`); every new governance entry names its source and date.
4. Error handling: the unavailable-reviewer path is defined for A and for B, with the harness constraint and the scope of each role's remaining passes.
5. Evidence mismatch: the tooling evidence in `design.md` cites file and line of the current tree; the results below come from the commands listed.

Evidence check: no external link is added.

## Checks

- `npm run openspec -- validate alternate-reviewers-per-pass --strict`: `Change 'alternate-reviewers-per-pass' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run findings -- validate`: `Every findings file is valid: 12 file(s).`
- Requirement bodies after the pass 1 fixes: "Authorized alternating reviewers" 491, "Unavailable reviewer" 490, "Rotation order" 490, "Changes under the one-reviewer rule" 485, and "No reviewer of another harness" 358 characters.
- Archive test in a scratch copy of the worktree after the merge and the coordinator decisions: `npm run openspec -- archive alternate-reviewers-per-pass --yes` applied 2 added, 3 modified, and 1 renamed requirement to `review-process`; `npm run openspec -- validate --all --strict --no-interactive` then reported 69 passed, 0 failed, and the archived spec kept the edited Purpose.
- The UI POC was neither type-checked nor built: it is outside the workspaces and builds only in a scratch copy with its own installed libraries (`docs/ui-poc/README.md` "Rebuilding"); the change is one badge string.
- The findings tests were not run, because the findings tooling is unchanged.

## Independent review

This change is a coordinator-authorized pilot of version 5: reviewer A = OpenCode `opencode-go/kimi-k3.1-pro#high`, reviewer B = Codex `gpt-6.1-sol` if pass 2 is needed (coordinator Niki, 2026-10-27).

### Pass 1 (reviewer A)

OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, on `18da6cde`, run 11:42:20 to 11:50:34 local time on 2026-10-27, session `ses_e8342b9e5ffeQTL5N2okB34vPg`:

`opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title alternate-reviewers-per-pass "<prompt>" < /dev/null`

Read-only proof: the SHA-256 snapshot of all tracked and untracked files was `48e7b6e0f2c1cbcc871efb12cb21ee7745b2884dd993750dde1e3007d69e90fb` before and after the pass. Result: 0 Critical, 0 High, 3 Medium, 7 Low. All ten are in `findings.jsonl`. Pass 2 confirmed nine of them, which keep the outcome `fixed`; it found the Medium contract-drift finding not fully resolved, and pass 3 confirmed its remaining instances, fixed in `9894a699`, so it is `fixed` too (see "Pass 2 (reviewer B)" and "Pass 3 (reviewer A)"). Fixes in `ba93fa1e`:

- Medium, contract-drift: the same-harness fallback contradicted unconditional "different harnesses" statements. The delta's "Authorized alternating reviewers", "Unavailable reviewer", and "Rotation order", governance "Two alternating reviewers per task", protocol worker step 5 and coordinator step 1, the `taskelith-task-protocol` skill, `AGENTS.md`, and the living `review-process` Purpose now carry the exception.
- Medium, process: the governance "Rotation" fallback and the delta scenario "Reviewer B without another harness" tested whether a reviewer of another harness exists in the turn; they now test availability, as "No reviewer of another harness" does.
- Medium, process: a task under the previous rule has no other reviewer. Governance "Unavailable reviewer", the protocol's unavailable-reviewer paragraph, the skill, and the delta's "Unavailable reviewer" scope the harness test to tasks with reviewers A and B; governance "Tasks under the previous rule" and the delta's "Changes under the one-reviewer rule" keep version 4's replacement choice, with no harness test.
- Low, stale-citation (4): `design.md`'s file and line citations of the findings tooling now match the tree after the `dev` merge.
- Low, docs (2): `design.md` and this record paraphrase the owner's approval in English instead of quoting it in Bulgarian.
- Low, docs: `docs/ui-poc/README.md` says that the published version 7 predates the badge change and no longer matches the source.

After the fixes, on `ba93fa1e` with this record, the checks were repeated:

- `npm run openspec -- validate alternate-reviewers-per-pass --strict`: `Change 'alternate-reviewers-per-pass' is valid`.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run findings -- validate`: `Every findings file is valid: 12 file(s).`
- Archive test in a scratch copy: `archive alternate-reviewers-per-pass --yes` applied 2 added, 3 modified, and 1 renamed requirement; `validate --all --strict --no-interactive` then reported 69 passed, 0 failed, the archived bodies kept the lengths above, and the edited Purpose stayed.

Next: pass 2 by reviewer B, Codex CLI `gpt-6.1-sol`, a full, independent review that also checks the pass 1 fixes.

### Pass 2 (reviewer B)

Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, on `e1781486`, run 11:56:41 to 11:58:54 local time on 2026-10-27, session `01a17cca-65ab-7710-92f5-7ce2a5d16de3`:

`codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`

The session header confirmed model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, and `codex-cli` v0.164.0. Read-only proof: the SHA-256 snapshot of all tracked and untracked files was `8d1f3a76588bf81309b372e03b990eb23624e12b78cd84e376d38f2de35362a9` before and after the pass.

Confirmation of the pass 1 fixes:

| Pass 1 finding | Pass 2 result |
| --- | --- |
| Medium, contract-drift: unconditional "different harnesses" statements | Not fully resolved: three delta scenarios still lacked the exception (finding 2 below) |
| Medium, process: the rotation fallback tested existence, not availability | Resolved |
| Medium, process: the harness test bound tasks under the previous rule | Resolved |
| Low, stale-citation (4): `design.md` citations of the findings tooling | Resolved |
| Low, docs (2): the owner's approval quoted in Bulgarian | Resolved |
| Low, docs: the UI POC README's published-build note | Resolved |

Result: 0 Critical, 0 High, 3 Medium, 1 Low, all in `findings.jsonl`; pass 3 confirmed all four fixes, so their outcome is `fixed`. Fixes in `9894a699`:

- Medium, spec-wording: the delta scenario "Second reviewer requested for the same change" barred "a reviewer other than B", which includes A; it now names "a reviewer other than the assigned A or B".
- Medium, contract-drift, the remainder of the pass 1 contract-drift finding: the delta scenarios "Assigned reviewer fails to run", "Reviewer A replaced before the third pass", and "Reviewers of a new change" required another harness without the fallback; their WHEN now requires an available authorized reviewer of another harness, and the fallback scenarios under "No reviewer of another harness" stay. A search of the change, `docs/`, `.claude/`, `AGENTS.md`, and the living spec for unqualified "different harness" statements also qualified `proposal.md`'s policy summary and `design.md` decision 3; the scope paragraph above keeps the brief as the owner approved it.
- Medium, process: this record deferred `make verify` on the pass 1 fixes to the `pre-push` hook. "make verify" now records the run after the pass 1 and pass 2 fixes (on `bc6683a3`), and "Limitations" and "Remaining gates" no longer defer it.
- Low, evidence-mismatch: the pass 1 findings had the outcome `fixed` before a later pass had checked them. Pass 2 has now confirmed nine, which keep `fixed` with that confirmation in their resolution; the contract-drift finding stayed `fixed-unreviewed` until pass 3 confirmed it, and "Pass 1 (reviewer A)" above says so.

After the fixes, on `9894a699` with this record, the checks were repeated:

- `npm run openspec -- validate alternate-reviewers-per-pass --strict`: `Change 'alternate-reviewers-per-pass' is valid`.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run findings -- validate`: `Every findings file is valid: 12 file(s).`
- Requirement bodies are unchanged: 491, 490, 490, 485, and 358 characters.
- Archive test in a scratch copy: `archive alternate-reviewers-per-pass --yes` applied 2 added, 3 modified, and 1 renamed requirement; `validate --all --strict --no-interactive` then reported 69 passed, 0 failed, and the archived spec holds the edited scenarios and Purpose.

Pass 3 by reviewer A followed, which confirmed the pass 2 fixes only, with no new scope.

### Pass 3 (reviewer A)

OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, as OpenCode recorded for the session, on `07fd1c01`, run 12:08:20 to 12:12:40 local time on 2026-10-27, session `ses_e832aebf0ffeGDCRhC48QIydt6`, scope: confirmation of the pass 2 fixes only, with no new scope:

`opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title alternate-reviewers-per-pass-pass3 "<prompt>" < /dev/null`

Read-only proof: the SHA-256 snapshot of all tracked and untracked files was `a7d866592fe1e9d359ed7a93e779865562ece3fa75a99ae4b70d74dcc2dad4d5` before and after the pass.

Confirmation of the pass 2 fixes:

| Finding | Pass 3 result |
| --- | --- |
| Medium, contract-drift: the remainder of the pass 1 finding (M1) | Resolved |
| Medium, spec-wording: the scenario barring a second reviewer | Resolved |
| Medium, contract-drift: three delta scenarios without the fallback | Resolved |
| Medium, process: `make verify` deferred to pre-push | Resolved |
| Low, evidence-mismatch: pass 1 outcomes `fixed` before a later pass | Resolved |

It also confirmed that `findings.jsonl` matches the schema and categories and that the requirement bodies are 491, 490, 490, 485, and 358 characters.

Result: 0 Critical, 0 High, 0 Medium, 1 Low, in `findings.jsonl` with the outcome `fixed-unreviewed`:

- Low, evidence-mismatch: the resolution of the pass 2 `make verify` finding at `findings.jsonl:13` still said its section was pending, and the reviewer said `verification.md:101` did too. At `07fd1c01` both said so; `verification.md:101` had been corrected in the working tree before the pass but not committed. Fix `b77e2e97` commits that line and rewrites the resolution: `make verify` completed on `bc6683a3` with exit 0 and is recorded below.

The fix is a Low of the last pass, so it is made without another review, under the pass cap and the Low-only rule. The three-pass cap is now reached; no further review follows.

After the fix, `npm run findings -- validate` reported `Every findings file is valid: 14 file(s).`

## make verify

`make verify` on `18da6cde`: exit 0 in 203 s on 2026-10-27. 2047 tests, 2045 passed, 0 failed, 0 cancelled, 2 skipped; coverage of all files 99.27 % lines, 91.97 % branches, 98.94 % functions. The Docker CLI ran with `DOCKER_CONFIG` set to an empty configuration (`{}`) in the session's scratch directory, because Docker Desktop's credential helper (`credsStore: desktop`) hangs on this iMac, as in [the x86_64 native acceptance record](../archive/2026-10-27-run-g2-native-acceptance-x86-64/verification.md); public images are pulled anonymously from the same engine, no credential was read, and the Makefile and the product were not changed.

### make verify after the pass 1 and pass 2 fixes

`make verify` on `bc6683a3`, which merges `origin/dev` `0864892f` (#336) into the branch after the pass 2 fixes `9894a699` and their record `d811a69e`; the merge touches none of this change's files: exit 0 in 181 s on 2026-10-27. 2054 tests, 2052 passed, 0 failed, 0 cancelled, 2 skipped; coverage of all files 99.27 % lines, 91.97 % branches, 98.94 % functions; findings validation 14 file(s). The Docker configuration was the same empty one as above.

## Limitations

- The published UI POC artifact's version 7 predates the badge change and no longer matches the source; `docs/ui-poc/README.md` "Published build" now says so. Republishing it is an owner decision outside this change.
- `make verify` ran with an empty Docker configuration, not the user's, because its credential helper hangs (see "make verify"), including its run after the pass 1 and pass 2 fixes.

## Remaining gates

- Archive, in the next commit.
- `make verify` by the `pre-push` hook on the pushed tree.
- Integration into `dev` by the coordinator (single pull request).
