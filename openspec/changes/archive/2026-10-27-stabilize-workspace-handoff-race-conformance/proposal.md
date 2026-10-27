## Why

The test "a provider that races two concurrent hand-offs fails the suite" (`packages/modules/workspace/test/workspace-conformance.test.ts:76`), added in #359, is flaky under host load: with a load average around 10 to 12 on an Apple M3 it failed 3 of 4 `make verify` runs, and it can fail the `pre-push` hook. It expects the racy double of the defect `racesHandOff` to fail the conformance case "lets one of two concurrent hand-offs through where executions share a separate account". That double only skips the per-root hand-off chain, so whether both hand-offs check before either writes its record is left to the scheduler. Under load one hand-off often writes first, the other is refused, and the case finds no race.

## What Changes

- The racy double holds each racing hand-off after its check until every hand-off in flight has checked, through a small `CheckBarrier` in `packages/modules/workspace/test/temp-dir-workspaces.ts`. Two concurrent hand-offs therefore both succeed every time, which is the race the case must detect.
- The conforming double keeps its hand-off chain; the shared steps become the helpers `markHandedOff`, `otherWorkspaceHandedOff`, and `mustWait`.
- No product code, conformance case, or requirement changes.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `git-workspace-port` requirements "One handed-off workspace per Linux worker" (scenario "Concurrent hand-offs") and "Workspace conformance suite" are unchanged; the change makes the test of the suite's own defect detection deterministic, so it sets `skip_specs: true`.

## Impact

Test reliability of `make verify` and the `pre-push` hook. `@taskelith/workspace` is a private workspace package; its source and behavior are unchanged.
