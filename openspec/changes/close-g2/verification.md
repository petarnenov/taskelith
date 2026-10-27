# Verification

Date: 2026-10-27. Draft: author checks of the draft are recorded below; the exit evidence, the fresh-clone reproduction, and the independent review are not done yet.

## Scope and source

G2 work plan item 27, `close-g2`, assigned by coordinator Niki and developed in a briefed implementation subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/close-g2` on branch `close-g2`. Base revision: `fe64386` on `dev`. Scope so far: `docs/decisions/0015-g2-closure.md` (new), `docs/foundation.md` (G2 section), and this change. Documentation only.

## Author self-check of the draft

- Every G2 plan row is mapped to archived changes by the row named in each proposal; rows 24 (part 24c) and 25 (25c and the Linux-host run) are not fully archived, and row 27 is this change.
- Each deferral names the archived change or decision that recorded it, or is marked as the author's assignment.
- Checked against the repository at `fe64386`:
  - the D1 double fault is covered by `report-all-unconfirmed-sealed-executions` (its proposal); the cap of 8 is its design D5;
  - 20d2 open question 2 is resolved by 23b: `infra/installation/Dockerfile:42` sets `TASKELITH_CONTAINMENT_PARENT`;
  - the `EnrollmentRequest` description that 20a left to the coordinator no longer says the journal exists before enrollment;
  - the `worker/journal-fault` control record is in worker journal contract section 2;
  - the crash windows skip on non-macOS hosts at `apps/control-plane/test/crash-windows.integration.test.ts:34-35`;
  - the fair-order test is at `apps/control-plane/test/placement.integration.test.ts:226`;
  - the ReDoS rule is at `packages/adapters/worker-control-plane-client/src/failure-cause.ts:19`.
- Not verifiable in this repository: the away decision `20261027T045006Z-opencode-96871` (assignment age stays offered-only), and the state of `keep-coverage-out-of-killed-test-processes`, which is not on `dev`.

## Checks

Light checks only, because another evidence run occupies the host; `make verify` has not run on this draft.

- `npm run openspec -- validate close-g2 --strict`: passed ("Change 'close-g2' is valid").
- `npm run verify:comments`: passed ("Every comment is within the comment length rule").
- `make findings ARGS="validate"`: passed ("Every findings file is valid: 3 file(s)").

## Independent review

Not started. Assigned reviewer: OpenCode `opencode-go/kimi-k3.1-pro#high`.

## Remaining gates

The tasks of sections 2 to 5 in `tasks.md`: the evidence of 24c, 25c, and the Linux-host run; the fresh-clone reproduction; the owner's confirmation of each author's assignment; the closure records; `make verify`; independent review; owner acceptance of ADR 0015; integration into `dev` and archive. Promotion to `main` is a later owner decision.
