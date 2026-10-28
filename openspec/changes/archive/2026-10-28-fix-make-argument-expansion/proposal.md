## Why

Pull request #383 promised that `make integrate`, `make record`, and `make record-check` pass their arguments as typed. Under GNU Make 4.4 they do not: worker Liki found on Ubuntu with GNU Make 4.4.1 that `make -s record-check "CHANGE=demo \$(shell touch /tmp/x)"` creates `/tmp/x`. The iMac's `/usr/bin/make` 3.81 passes, so `make verify` there never saw it. On Linux workers `test/verification-record.test.ts` fails, so they get no stamp and no `make record`, and the `pre-push` hook fails.

## What Changes

- `Makefile`: the `unexport BRANCH TITLE BODY RESUME CHANGE LOG` line moves from before the `integrate` target to the top of the file, before the first `$(shell)` call, with its comment updated.
- `test/gnu-makes.ts` (new): lists each distinct GNU make on `PATH`, `make` and `gmake`, so a host whose `make` is 3.81 also tests a Homebrew GNU Make 4.4.
- `test/verification-record.test.ts` and `test/integrate-script.test.ts`: the two "as typed" tests run under every GNU make that `test/gnu-makes.ts` finds.
- The `agent-task-protocol` requirements "Shared integration command" and "Generated verification record" name GNU Make 3.81 and 4.4 and gain a scenario each.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-task-protocol`: "Shared integration command" and "Generated verification record" pass their arguments as typed under GNU Make 3.81 and 4.4.

## Impact

Only the repository's `Makefile` and tests change; the published `taskelith` package does not, so the commits are `chore`, `test`, and `docs`. The command-line interface of the three targets is unchanged.
