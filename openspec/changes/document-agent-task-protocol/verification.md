# Verification: document-agent-task-protocol

Date: 2026-10-24.

## Scope and source

The owner asked on 2026-10-24 for the agent task protocol to be recorded so that it is not lost between sessions, possibly as a skill. The coordinating session (Niki) proposed a repository document linked from `AGENTS.md` plus a pointer skill, and made the change. The rules recorded come from the owner's instructions the same day: delegate parallel tasks to the worker sessions, follow the merge protocol for finished tasks without a separate approval, keep `dev` synchronized, tell workers to clear their context after a merge, give UI tasks to the session holding the UI proof of concept, and send that session the protocol. Base revision: `1b9c183` on `dev`. Scope: `docs/agent-task-protocol.md`, `.claude/skills/taskelith-task-protocol/SKILL.md`, one line in `AGENTS.md`, and this change.

## Author self-check before review

- The protocol grants no authority: it records the owner's authorizations of 2026-10-24 and defers to `docs/governance.md` and `docs/releases.md`.
- The protocol summarizes operational steps and links governance and releases for the full rules; where it summarizes them (commit types, `verification.md` contents, reviewer rotation, snapshots, the review prompt), it says that they win.
- The reviewer invocations match those recorded in archived `verification.md` files: Codex (`2026-10-24-align-contract-decision-status`), Antigravity (`2026-10-24-select-contract-and-schema-tooling`), and Claude Code (`2026-10-24-capture-speckit-native-artifacts`).
- Evidence check: the change adds no external link. The internal links point to existing files and headings: `docs/agent-task-protocol.md` (from `AGENTS.md`), `governance.md` and its anchors `#authority`, `#independent-review-process`, `#lifecycle-and-records`, and `#evidence-freshness`, `releases.md` and `#parallel-work-with-worktrees`, `decisions/0004-first-class-engineering-principles.md`, `decisions/0008-product-ui-and-integration-authority.md`, and the archived SpecKit capture record.
- All content is English, and the npm package is unchanged (`.claude/` and `docs/agent-task-protocol.md` are not in `files`).

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `npm run openspec -- validate document-agent-task-protocol --strict` passed, and `make verify` passed (tests with coverage, boundary and coverage-scope checks, dependency inventory, strict OpenSpec validation, package verification).

## Independent review

Assigned reviewer (rotation): Antigravity CLI with `agy -p <prompt> --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>`, run from the worktree.
The prompt named AGENTS.md, ADR 0004, ADR 0008, governance, and releases as criteria and asked for every instance of a problem. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after each pass were equal; prompts, logs, and snapshots were kept outside the worktree.

- **Pass 1 — conversation `aa4182c5-081f-4bf7-bacc-8ea57e447959`**; the log reports `gemini-4-argon-medium`. Findings: 0 Critical, 2 High, 3 Medium, 2 Low. All accepted and resolved:
  1. High: the delta for the new capability had no `## Purpose`, so `archive` would write a placeholder that fails strict validation. Added, and worker step 2 now requires it.
  2. High: integration did not handle a conflict with `dev` or evidence invalidated by the merge. Coordinator step 2 now integrates one task at a time and returns such a task to its worker; a new worker step 9 resolves it, reruns the checks, and has the reviewer review the resolved diff, mirroring ADR 0008 decision 3; worker step 1 notes evidence freshness. The spec delta has a new scenario.
  3. Medium: reviewer rotation omitted the network-access rule. Coordinator step 1 now points to the review process and names it.
  4. Medium: the `verification.md` contents were incomplete, the Codex confirmation named only the session ID, and prompt, log, and snapshot files could land in the worktree. Worker step 6 lists the required contents with links; the Codex row names model, effort, sandbox, and session ID; the section says to keep those files outside the worktree and to include shared evidence directories in the snapshot.
  5. Medium: integration, archive, and cleanup commands were incomplete, and cleanup could remove a worker's current directory or miss the other machine. The coordinator steps now include `git fetch`, the worktree and `npm ci` steps, the `archive-<change>` branch, merge commits, and the Purpose fix; the worker returns to the main clone at handoff and removes its own worktree after the merge.
  6. Low: owner-decision routing and the worker's last step were inconsistent across the documents. The owner role lists all owner questions, coordinator step 1 assigns only tasks without an open owner decision, and the skill, proposal, and spec name cleanup and context reset.
  7. Low: the evidence check listed only some internal links, the self-check overstated that nothing was restated, and `verification.md` lacked remaining gates. All corrected.
  While fixing, the author added the commit-type rule to worker step 3 (the item 7 integration showed that a `feat` commit in a private package would trigger an unwarranted release) and the recommit step to coordinator step 2.

## Remaining gates

Pass 2 of the independent review; integration (push, pull request into `dev`, merge) and archival.
