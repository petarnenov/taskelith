# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 5, assigned by the coordinating session (Niki) to the worker session Pepi under decision D14 (a). Base revision: `7850c70` on `dev`. Scope: `docs/contracts/worker-journal.md` and this change, with the new `worker-journal` capability. Inputs: decisions D4 (a) and D7 (c), the storage contract, the trust model, the operational targets, architecture sections 5, 9, 14, and 15, the launch authorization contract of item 3 and the supervisor identity contract of item 4, whose names this contract uses. Both are under review in parallel: the first draft used item 3 at `53178c9` and item 4 at `a326635`; the pass-1 fixes align with item 3 at `96a0843`, since merged into `dev`, and item 4 at `4235c7d` (branch `define-supervisor-identity-contract`). After pass 1, `origin/dev` at `ddef6d2` (items 1 and 3 merged and archived) was merged into the branch; the contract now cites item 1's finding that both SQLite bindings bundle SQLite 3.53.4 ([G2 infrastructure](../../../docs/g2-infrastructure.md) section 4). A later change to either may require aligning this contract again.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1.
- Evidence check: the contract's two external links are pinned to tags, SQLite `version-3.53.4` (`src/os_unix.c` lines 3815–3829) and libuv `v1.52.1` (`src/unix/fs.c` lines 182–187). The author fetched both files at those tags on 2026-10-25 and confirmed the `F_FULLFSYNC` fallback to `fsync` in each, and `node -p process.versions.uv` under Node 24.22.1 prints `1.52.1`.
- Documentation and specification only; no code, package, or lockfile change.

## Author self-check before review

- Every topic of the plan row is covered: the inbox and launch intent before acknowledgement (section 5), the local outbox (6), the durability guarantee per write (3, 5), interrupted writes and flush failure (7), full disk (7), a corrupt or missing journal (8), lock ownership (9), format versioning (10), disk loss after acknowledgement (11), and the `worker/` subtree (2).
- The durability settings are stated as requirements, not code, under decision D4 (a).
- Item 3's needs are met by W2, W3, and W6; item 4's execution record uses the durable file rule of section 4, and its CP3 is W4.
- Every requirement of the spec delta is under 500 characters, and the delta starts with a `## Purpose`.

## Checks

In the worktree: `npm run openspec -- validate define-worker-journal-contract --strict` passed, and `make verify` passed before review, after the pass-1 fixes, after the merge of `origin/dev`, and after the pass-2 fixes.

## Independent review

Assigned reviewer: Codex CLI with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree. The prompt named AGENTS.md, ADR 0004, the governance review process, the agent task protocol, the plan row, decisions D4 (a) and D7 (c), the storage, trust, and operational-target documents, architecture sections 5, 9, 14, and 15, and the current item 3 and item 4 contracts in their worktrees, and asked for every instance of a problem with severity, file, line, and fix. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` were taken before and after each pass.

- **Pass 1 — session `01a17026-3953-7932-a42b-7591f9c57027`,** reviewed revision `34d7003`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `653fd6dd…87a7`, equal. Findings: 0 Critical, 6 High, 7 Medium, 1 Low. All accepted and resolved:
  1. High: reopening after a flush failure may read cached pages that never reached the device. The worker now stays stopped until a host restart or a new journal incarnation.
  2. High: the spec scenario sealed an execution whose record might have been journaled and lost. It now seals only when the record is not journaled as written, and a new scenario reports a lost journaled record as uncertain.
  3. High: a crash between the inbox commit and a separate cancellation commit lost the cancellation. W1 now commits a cancellation request with the inbox entry; W7 is gone, and recovery forwards pending cancellations.
  4. High: the sequence check cannot detect every rollback. Restoring a journal is forbidden, the sequence check is described as partial, and an inventory report on each reconnect lets the control plane resend an omitted command when no grant exists and reconcile it otherwise.
  5. High: a broker acknowledgement and the stream's retention do not prove the control plane received an observation. Entries now stay until the control plane confirms them cumulatively by sequence, and unconfirmed ones are published again.
  6. High: "repeat the next action" would hand off an old grant after a restart. Section 5 now has a recovery table per last commit: an old operation or grant is abandoned and its execution sealed, and a journaled record goes to item 4's recovery.
  7. Medium: the subtree rules covered workspace content. They now apply to control records only.
  8. Medium: the replace rule omitted item 4's `intent` and the identity update for a new incarnation. Both are named.
  9. Medium: `uncertain` was an execution state. It is now evidence beside the item 3 state.
  10. Medium: the WAL settings are no hard cap. The contract says so, requires small transactions, counts the WAL toward the disk floor, and treats a failed checkpoint as a flush failure.
  11. Medium: `EXCLUSIVE` must be set before the first WAL access. The initialization order and a check for a missing `-shm` file are required.
  12. Medium: disk loss recovery cited item 4's removed marker scan. It now cites item 4's populated containments on Linux.
  13. Medium: the recorded item 3 and item 4 revisions were outdated. The contract is aligned with the current ones, recorded above.
  14. Low: item 4's `fate` is now `launch`. Renamed, with `supervisor.<n>` added to the create-once files.

- **Pass 2 — session `01a1702f-32c7-7ac1-80f0-ee44a08675b5`,** reviewed revision `3001e99`, with item 4 read at `4d90df6`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `c7223ff5…a466`, equal. The reviewer confirmed pass-1 findings 2, 3, 5, and 7 to 14 resolved, and 1, 4, and 6 resolved in part, with the remaining gaps raised as the findings below. Findings: 0 Critical, 3 High, 3 Medium, 0 Low. All accepted and resolved:
  1. High: an assignment acknowledged after W1 and crashed before W2 had no recovery. A recovery row now continues every accepted, uncancelled launch intent without a live execution, whether or not it was acknowledged, and a test covers it.
  2. High: "W5: nothing to repeat" also ended recovery for a started, running execution. W5 is split into W5s and W5e; W4 or W5s without a terminal fact goes to item 4's recovery.
  3. High: SQLite 3.53.4 falls back to `fsync` when `F_FULLFSYNC` fails and returns that result, so a failure is invisible per write. The author confirmed this in the source and found the same fallback in libuv 1.52.1. The worker now accepts on macOS only a filesystem that supports `F_FULLFSYNC`, checked at startup as an item 14 qualification gate, with a spec scenario and a test; the reviewer's link pointed at other lines and was corrected.
  4. Medium: recovery after W3 re-authorized after any rejection. W3 now distinguishes a grant, a retryable rejection, and a non-retryable rejection, which is never retried.
  5. Medium: the spec requirement treated every repeated sequence as lost history. It now requires a different observation identity, with scenarios for a repeated publication and a conflicting sequence.
  6. Medium: a reader of a create-once file after `EEXIST` could act on a file whose directory entry was not yet durable. A reader now syncs the file and its directory before acting on a file it did not make durable itself, with a crash test between the winner's `link` and directory sync.

## Remaining gates

Independent review; integration (push, pull request into `dev`, merge) and archival by the coordinator; implementation and tests in items 14, 20, 21, 24, and 25.
