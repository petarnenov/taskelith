## Scope and source

Task `finalize-g3-plan`, assigned by coordinator Niki on 2026-10-27 after the G2 closure ([ADR 0015](/docs/decisions/0015-g2-closure.md), accepted by the owner on 2026-10-27). Source: the plan's own status line, "It is finalized when G2 closes ... the finalized plan adds those deferrals and corrects the starting point to what G2 actually delivered". Scope: the status of [`docs/g3-plan.md`](/docs/g3-plan.md), its "Starting point" corrected to G2 as built, every ADR 0015 decision 5 deferral whose gate is G3 attached to the G3 item that owns it, and the dependency and wave tables. Item 0 stays first.

Out of scope: new owner decisions, changes to D1 to D18, starting any G3 item, edits to ADR 0015 (edited by other sessions) or to `docs/foundation.md`, and work on deferrals whose gate is not G3.

## Revision and environment

- Base: `origin/dev` at `56346d92` (#348); `origin/dev` at `eda6c283` (#349) merged into the branch with a merge commit (`364ecafe`). Branch `finalize-g3-plan`, worktree `taskelith-worktrees/finalize-g3-plan`.
- Host: macOS 26.6.2 (25G83) on x86_64; Node.js v24.22.1 from `.nvmrc`, npm 12.2.1.
- Developed by a subagent of the worker session, as [subagent execution](/docs/agent-task-protocol.md#subagent-execution) requires; the session checks the result before review.

## Author self-check and evidence check

- **Exhaustiveness.** ADR 0015 decision 5 has 46 top-level entries; "Seccomp profile open items" has three sub-entries, which the plan lists as three rows, and "Restore quarantine" two, which stay in its row. The plan's "G2 closure deferrals" table has 48 entry rows, 46 plus 2, in the ADR's order and groups.
- **G3 homes.** Rotated worker credentials and TLS: item 26. Worker self-check admission wiring: item 27. Evidence retirement entry and per-project download authorization ("G3, with login"): item 10, with the retirement operation in item 9. Writers that invalidate launches: the "Work items" introduction, for every item that adds such a writer. Re-admission and the reconciliation queue surface: new item 44, with its operations in item 9. The bubblewrap sandbox and model-calling harness scenarios on Linux: item 35, which ADR 0015 names. The macOS arm64 re-run, race g, and the 24c-dependent rows: new item 43. The G3 groundwork re-review: item 0.
- **Starting point citations.** Fresh-clone base `bd6108d4` (ADR 0015 decision 4). Crash windows: 28 of 28 on `macos-26-x86_64` (decision 3), 29 of 29 on Linux after L1 (decision 2), 15 passed and 11 failed on D1 on `macos-26-arm64` (decision 3). 24c: 34 records, Linux x64, test-side process-group launch host, race g without a record (decisions 2 and 5); the skip is `SCENARIO_HOST` at `test/g2-scenarios/scenario-run.ts:16`, added by `6d40c0c4`. The cursor of the closure was `#after` at `apps/control-plane/src/application/placement-service.ts:51` on the first base; since #349 the pass reads it through `tx.rotation` (same file, line 73). Launch authorization contract sections 5 ("Invalidation ordering") and 11 ("G2 implementation") hold the writer rule and `current_revisions`. Execution wire contracts section 3 is "Protocol version".
- **Placement changes.** #344 `placement-backoff-preserves-rotation` is merge `21f399a5`, after `bd6108d4` and before #347 `close-g2` (`09a11766`); #348 `stop-placement-pass-at-fleet-decline` is merge `56346d92`, after #347 (`git log --first-parent origin/dev`). Their behavior and limits are from their archived proposals and verifications, "Limitations".
- **Cursor follow-up.** `persist-placement-rotation-cursor` landed with #349, merge `eda6c283` (`git log --first-parent origin/dev`); the starting point cites its archived proposal (port, table `placement_rotation`, contract section 13 "Durable cursor") and verification, "Limitations" (shared cursor, last writer wins; a decline-only move lost on an outage or a failed end-of-pass write).
- **Coordinator decisions.** Q1 to Q4 of the first draft are recorded in `design.md`, "Coordinator decisions of 2026-10-27"; the owner's start of G3 on 2026-10-27 is in the status, and the PostgreSQL TLS decision of the owner's away delegate (away run `20261027T142720Z-opencode-88550`, option A) is in item 26 and the deferral table's TLS row. At `eda6c283`, ADR 0015 line 105 is the entry "TLS and the installation certificate authority" (plain HTTP, NATS, and PostgreSQL on localhost ports: G3 item 26, D11), and line 151 the entry "Failover, pool sizing under load, and expand/contract migrations" of PostgreSQL (G6 and G7). D11 (b) names the installation authority for the API, broker, and enrollment, and an operator-supplied certificate for the browser endpoint, falling back to the installation authority (plan, D11 row).
- **Waves.** Item 43 depends only on item 0, as every other unmerged item does: wave 1. Item 44 depends on items 9 (wave 3) and 10 (wave 4): wave 5. The longest chain the plan names is unchanged.
- **Owner decisions.** No row of D1 to D18 changed; item 0's per-item checks, decided by the owner on 2026-10-26, are unchanged; the arm64 re-run is run by the owner with physical access to the MacBook Air, as the owner decided on 2026-10-27.
- **Links.** The plan's new links are same-directory or below `docs/` (`decisions/0015-g2-closure.md#5-deferrals`, `foundation.md#g2-status`, `contracts/...`, `worker-platforms.md#native-acceptance-gates`) and in-page anchors; this record links root-relative or same-directory only.

## Checks

Run after merging `origin/dev` at `eda6c283` and applying the coordinator's answers, again after the pass 1 fixes (`1682cddd`) with the pass 1 records, and again after the pass 2 fixes (`5328dd84`) with the pass 2 records, with the same results; `verify:findings` was run as `make findings ARGS="validate"`.

| Check | Result |
| --- | --- |
| `npm run openspec -- validate finalize-g3-plan --strict` | `Change 'finalize-g3-plan' is valid` |
| `npm run verify:links` | `Every checked link conforms; 332 archived links remain in scripts/record-links-baseline.tsv.` |
| `npm run verify:findings` | `Every findings file is valid: 27 file(s); every pass summary file is valid: 7 file(s).` (after merging #349; 26 and 6 before) |
| `npm run verify:comments` | `Every comment is within the comment length rule.` |
| `make verify` on `7aa10924`, after merging `origin/dev` at `eda6c283`, before pass 1 | Exit 0; last line `Packed file allowlist and installed CLI verification passed.` Run by the worker session on the macOS x86_64 iMac |
| `make verify` on `175d08d4`, after the pass 1 fixes, before pass 2 | Exit 0. Run by the worker session on the macOS x86_64 iMac |
| `make verify` after the pass 2 fixes, before pass 3 | Pending: run by the worker session |

## Review checklist

The checklist of the brief is in [`design.md`](design.md), "Review checklist".

## Independent review

Reviewers assigned by the coordinator: reviewer A, Claude Code `claude-fable-5-1`, for passes 1 and 3; reviewer B, Codex `gpt-6.1-sol`, for pass 2.

### Pass 1 (reviewer A)

- Reviewer A: Claude Code `claude-fable-5-1`, effort `medium`, run by the worker session; reviewed head `7aa109245d6769ce5d5090d4eb3653c4188fbc69`.
- Invocation, as in the [agent task protocol](/docs/agent-task-protocol.md#reviewer-invocations) row "Claude Code (claude-fable-5-1)": `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- Model confirmation: `claude-fable-5-1` in the JSON `modelUsage`. Session `749ee07e-4cc0-41b3-8463-07b8f0ba8a6b`. Snapshot before and after: equal. Both as relayed by the worker session.
- Findings: 0 Critical, 0 High, 2 Medium, 5 Low, matching its `passes.jsonl` line. All were fixed in `1682cddd`:
  - **F1 (Medium, stale-citation):** the writers rule in the "Work items" introduction kept an unexpanded `{D}` placeholder. It now cites ADR 0015 decision 5, "Writers that invalidate launches".
  - **F2 (Medium, process):** item 26 left PostgreSQL TLS open with the owner but named no open decision in "Blocked by". The owner's away delegate decided it (away run `20261027T142720Z-opencode-88550`, option A); item 26 and the TLS row record the decision, and nothing is left open.
  - **F3 (Low, spec-wording):** the status kept the 2026-10-26 history in present tense and the D16 (a) start rule twice. The history is in past tense, and only the 2026-10-27 clause remains.
  - **F4 (Low, docs):** item 41 ignored items 43 and 44. It now depends on 10–40, 43, and 44; both are in earlier waves, so item 41 stays in wave 11.
  - **F5 (Low, spec-wording):** item 26, `design.md`, and this record quoted D11 inaccurately. They now quote D11 (b): the installation authority for the API, broker, and enrollment, and an operator-supplied certificate for the browser endpoint, falling back to the installation authority.
  - **F6 (Low, docs):** `proposal.md` "Why" and task 1.2 omitted #349. Both name #344, #348, and #349.
  - **F7 (Low, evidence-mismatch):** this record claimed root-relative links only although it links `design.md`. It now says root-relative or same-directory.

### Pass 2 (reviewer B)

- Reviewer B: Codex CLI `gpt-6.1-sol`, reasoning effort `medium`, run by the worker session; reviewed head `175d08d48eef41b93ee03b259f05524ccb498594`.
- Invocation, as in the [agent task protocol](/docs/agent-task-protocol.md#reviewer-invocations) row "Codex CLI (gpt-6.1-sol)": `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: model `gpt-6.1-sol`, reasoning effort `medium`, and the read-only sandbox in the output header. Session `01a17dcb-b994-78c0-975d-68e84d63787b`. Snapshot before and after: equal. Both as relayed by the worker session.
- The reviewer confirmed the seven pass 1 fixes and the record of the PostgreSQL TLS decision.
- Findings: 0 Critical, 0 High, 1 Medium, 2 Low, matching its `passes.jsonl` line. All were fixed in `5328dd84`:
  - **G1 (Medium, evidence-mismatch):** this record and `tasks.md` gave no `make verify` result or revision. "Checks" records the runs on `7aa10924` and `175d08d4`, both exit 0, and a pending run before pass 3; task 2.2 stays open until the archive.
  - **G2 (Low, docs):** the starting point said a slot freed during a pass goes to the declined project in the next pass. It now follows #348's limits: freed capacity is offered in the next pass, in rotation order, where another replica or a task earlier in the rotation may take it first.
  - **G3 (Low, spec-wording):** the deferral table's legend called entries without a gate not open work and used "—" for the open Docker Desktop credential helper item. The legend now separates "Not G3" (open outside G3: another gate, a follow-up without a gate, or its owner) from "—" (resolved or accepted), and that row is "Not G3".

### Pass 3 (reviewer A)

Not yet run.

## Limitations

- Documentation only; no runtime behavior is affected, so no runtime check applies.
- The deferral table summarizes ADR 0015 decision 5 as of the base; later edits of the ADR are not reflected.
- The writers rule names no item for the first writer of artifact revisions.

## Remaining gates

- `make verify` after the pass 2 fixes, before pass 3, and on the archive commit (task 2.2 stays open until then).
- Independent review passes 1 to 3 and their records.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
