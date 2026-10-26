## Why

The native worker lifecycle tests of `test/installation-scenarios.test.ts` (from #306, commit `895cdf7`) fail deterministically on Linux and pass on macOS. The coordinator found it during G2 work item 24c and assigned the fix. `mode_of()` in `scripts/installation-scenarios.sh` runs `stat -f %Lp` first. GNU stat reads `-f` as "file system status" and `%Lp` as a file name: it prints a file system report to stdout and exits non-zero, and the GNU fallback then appends `700`. The caller gets the report followed by `700` instead of `700`, so the check of the `worker/` subtree's mode fails.

## What Changes

- `mode_of()` tries the GNU form `stat -c %a` first and falls back to the BSD form `stat -f %Lp`. BSD stat rejects `-c` without writing to stdout, so macOS still takes the BSD form.

No spec delta: this is a defect fix under the existing requirement "Restarted native worker proven" of `native-worker-acceptance`, which already demands that the `worker/` subtree has mode 0700; the requirement does not change.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

One line of the test-side scenario script `scripts/installation-scenarios.sh`. No product code, contract, or dependency changes. The commits use `test` and `chore`.
