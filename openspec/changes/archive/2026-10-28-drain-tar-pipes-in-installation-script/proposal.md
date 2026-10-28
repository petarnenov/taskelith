## Why

`make verify` failed on the iMac in the test "the reproducibility check fails on a differing layer of two indexes with their own attestations" with status 141 instead of 1. Status 141 is SIGPIPE. `scripts/installation.sh` runs under `set -euo pipefail` and pipes `git archive` into `tar -xf -` in `unpack_context`. macOS `tar` (bsdtar) may exit at the end-of-archive marker before it reads the rest of the stream; when the writer then writes, it dies of SIGPIPE, `pipefail` makes the pipeline fail with 141, and `set -e` ends `check_reproducible`. The race depends on timing, so it shows only under the load of a parallel `make verify`. `saved_manifest` pipes `docker image save` into `tar -xOf - manifest.json` and has the same race, which there reports a false "the manifest.json … cannot be read".

## What Changes

- `scripts/installation.sh`: `unpack_context` and `saved_manifest` drain the rest of the stream with `cat >/dev/null` after `tar` succeeds.
- `test/installation-script.test.ts`: the fake `git archive` and `docker image save` append 1 MiB of zeros, more than a pipe buffer, when `FAKE_TAR_TRAILER` is set and keep the writer's SIGPIPE status; a new test runs the reproducibility check with it and expects a pass. Before the fix the test fails on every run, with 141 from `unpack_context` and, with only that fixed, with status 1 from `saved_manifest`.
- The `local-installation` requirement "Opt-in reproducibility check" gains a scenario; its text is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-installation`: "Opt-in reproducibility check" gains the scenario "Tar reader stops before the end of its stream".

## Impact

Only a repository script and its test change; the published `taskelith` package does not, so the commits are `chore`, `test`, and `docs`. The `make` interface is unchanged.
