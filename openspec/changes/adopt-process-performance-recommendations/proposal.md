## Why

The coordinator's analysis of the process and token use of the agent fleet (owner-approved on 2026-10-27) found that most of the waiting and tokens go to mechanics, not to the work: `make verify` takes a median of 179 s (p90 214 s) and runs about seven times per change, two to four of them redundant (integration runs it once before the push and once more in the `pre-push` hook on the same tree, and 8 of 28 integration merges changed nothing); 46% of the coordinator's messages are Docker slot traffic, with a median slot wait of 13.5 min (p90 57 min); pass 3 found one Medium finding in 15 runs; 39% of all findings target the change's own records (evidence mismatches and stale citations); 73 of 94 worker sessions passed 150,000 tokens of context; subagents resumed after idling cost 3.9% of tokens; 72 owner `/clear` restarts in four days had a p90 wait of 83 min; and 28 of 95 changes record a failed `make verify`, with six flaky-test follow-ups.

The owner approved all ten recommendations of that analysis on 2026-10-27. Recommendations 1, 3, 7, and 9 change gates or `AGENTS.md`; they are recorded here as owner decisions of 2026-10-27.

## What Changes

1. **Verified-tree stamp** (owner decision 2026-10-27). `make verify` writes a local, untracked stamp when it passes on a clean tree; the `pre-push` hook skips `make verify` when the clean HEAD tree has a stamp of its profile; integration reuses a full stamp of the merged tree. CI never reuses a stamp.
2. **Docker slot lock.** `make test` holds a host-wide, per-user first-in, first-out lock while its services run, so workers no longer ask the coordinator for the Docker slot.
3. **Conditional pass 3** (owner decision 2026-10-27). Pass 3 runs only when the pass 2 fixes change code, tests, contracts, or specifications, or pass 2 found a Critical or High finding; otherwise the pass 2 fixes are recorded as `fixed-unreviewed`. The three-pass cap and the Low-only rule stay.
4. **Generated records.** `make record` writes the mechanical part of `verification.md` between generated markers, and `make record-check` fails when that part differs from reality; workers run it before pass 1.
5. **Thin session context.** The protocol and skills state the practice that keeps sessions under 150,000 tokens, and a tracked Claude Code hook warns near the limit.
6. **Fresh subagents.** A subagent idle for more than five minutes is not resumed; fix rounds start a fresh subagent with a short brief.
7. **Docs-only verify profile** (owner decision 2026-10-27). On a feature branch that changes only documentation and OpenSpec records, `make verify` skips `make test`; integration always runs the full profile. `AGENTS.md` says so.
8. **Reviewer assignment by measured yield.** Already adopted by the owner and recorded by `normalize-reviewer-keys`; this change only stays consistent with it.
9. **No owner `/clear` after each task** (owner decision 2026-10-27). Workers continue in the same session, and the coordinator briefs them directly after the landing report.
10. **Flaky tests at the source.** A test-authoring rule in the protocol and the existing `test-flakiness` checklist category.

The coordinator's integration flow moves into the repository as `scripts/integrate.sh` and `make integrate`, using recommendations 1, 2, and 7.

## Capabilities

### New Capabilities

### Modified Capabilities

- `integration-flow`: the `make verify` profiles, the verified-tree stamp, and the stamp in the `pre-push` gate.
- `development-environment`: the Docker slot lock of `make test`.
- `agent-task-protocol`: the shared integration command, the unpushed coordinator merge, the generated verification record, thin session context, fresh subagents for fix rounds, deterministic test authoring, and no context clear after integration.
- `review-process`: the conditional third pass and the record check before the first pass.

## Impact

Repository tooling and process documents only: `Makefile`, `.githooks/pre-push`, new scripts `scripts/verify-stamp.ts`, `scripts/docker-slot.ts`, `scripts/integrate.sh`, `scripts/verification-record.ts`, and `scripts/context-warning.ts` with their tests, a new tracked `.claude/settings.json`, `AGENTS.md`, `docs/agent-task-protocol.md`, `docs/governance.md`, `docs/fleet.md`, and the three Taskelith skills. No product code and no published package content change. The concurrent changes `measure-checklist-effect`, `normalize-reviewer-keys`, and `stabilize-workspace-handoff-race-conformance` touch some of the same documents; this change keeps its edits there local and does not duplicate them.
