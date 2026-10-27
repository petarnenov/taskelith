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

Rule text and change records: `52049334` and `8914f3dc` on base `744689cb`, and the first verification record `58bd811b`. Merge `a4f223d0` merged `origin/dev` at `9c0c1706`, which brought pull request #334 (`require-finding-capability`). Its conflicts in `docs/agent-task-protocol.md` worker steps 5 and 6, `.claude/skills/taskelith-coordinator/SKILL.md`, and `.claude/skills/taskelith-worker/SKILL.md` were resolved by keeping both `dev`'s capability and record-quality wording and this change's A and B wording. The coordinator decisions above are in the commits after `a4f223d0`.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`.

## Author self-check

Against the review checklist of the brief (`make findings ARGS="checklist --capability review-process --files docs/**,.claude/**"`) and ADR 0004:

1. Redaction: no credential, token, or local path beyond the repository's worktree convention is added; `findings.jsonl` is empty.
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
- Requirement bodies: "Authorized alternating reviewers" 476, "Unavailable reviewer" 471, "Rotation order" 489, "Changes under the one-reviewer rule" 374, and "No reviewer of another harness" 358 characters.
- Archive test in a scratch copy of the worktree after the merge and the coordinator decisions: `npm run openspec -- archive alternate-reviewers-per-pass --yes` applied 2 added, 3 modified, and 1 renamed requirement to `review-process`; `npm run openspec -- validate --all --strict --no-interactive` then reported 69 passed, 0 failed, and the archived spec kept the edited Purpose.
- The UI POC was neither type-checked nor built: it is outside the workspaces and builds only in a scratch copy with its own installed libraries (`docs/ui-poc/README.md` "Rebuilding"); the change is one badge string.
- The findings tests were not run, because the findings tooling is unchanged.

## Independent review

Pending. This change is a coordinator-authorized pilot of version 5: reviewer A = OpenCode `opencode-go/kimi-k3.1-pro#high`, reviewer B = Codex `gpt-6.1-sol` if pass 2 is needed (coordinator Niki, 2026-10-27).

## Limitations

- The published UI POC artifact's version 7 predates the badge change and no longer matches the source; `docs/ui-poc/README.md` "Published build" now says so. Republishing it is an owner decision outside this change.
- `make verify` has not been run yet.

## Remaining gates

- `make verify`.
- Independent review.
- Archive.
- Integration into dev by the coordinator (single pull request).
