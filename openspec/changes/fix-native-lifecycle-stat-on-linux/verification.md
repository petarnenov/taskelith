## Scope and source

`fix-native-lifecycle-stat-on-linux`, assigned by the coordinator on 2026-10-26 after it found the defect during G2 work item 24c: the native worker lifecycle tests of `test/installation-scenarios.test.ts` (from #306, commit `895cdf7`) fail deterministically on Linux. In scope: `mode_of()` in `scripts/installation-scenarios.sh`, with the GNU-first order the coordinator specified. Excluded: every other part of the scenario script and its tests.

## Revision and environment

- Base: `origin/dev` at `a38aefc`. Branch `fix-native-lifecycle-stat-on-linux`. The fix is `da3f013`; the change documents follow it.
- Host: Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; `stat (GNU coreutils) 9.4`; Node.js 24.22.0 through `nvm use`.

## Author self-check and evidence check

- Reproduced on a mode 0700 directory: `stat -f %Lp "$d" 2>/dev/null || stat -c %a "$d"` printed a GNU file system report (`File:`, `ID:`, `Block size:`, `Blocks:`, `Inodes:`) followed by `700`; `stat -c %a "$d" 2>/dev/null || stat -f %Lp "$d"` printed only `700`.
- The diff is one line of `mode_of()`; its comment is unchanged and within two lines of 80 characters.
- No new test: the three native lifecycle tests compare the mode with `700` exactly and failed on the extra output, so they guard the contract.
- No product code, contract, or dependency changes; `skip_specs: true`, because the requirement "Restarted native worker proven" of `native-worker-acceptance` already demands mode 0700.

## Checks

| Check | Result |
| --- | --- |
| Before the fix, at `a38aefc`: `node --experimental-strip-types --test --test-reporter=spec --test-name-pattern='native worker' test/installation-scenarios.test.ts` | Failed: 3 tests, 0 passed, 3 failed; each with "the mode of the worker subtree: expected '700', got '  File: \"/tmp/taskelith-native.…/data root with spaces/worker\"…700'" |
| The same command at `da3f013` | Passed: 3 tests, 3 passed, 0 failed |
| `npm run openspec -- validate fix-native-lifecycle-stat-on-linux --strict` | valid |
| `make verify` of `da3f013` with this change's documents | Passed: 1917 tests, 1873 passed, 0 failed, 44 skipped (platform-specific tests); coverage of all files 99.18% lines, 91.82% branches, 98.79% functions; OpenSpec 70 passed; `verify:archive` and `verify:package` passed; the control plane fetch flake (B6) did not occur |

## Review

Pending: independent review by OpenCode CLI (kimi-k2.7-code), one pass.

## Limitations

- macOS was not re-run here; the BSD path relies on BSD stat rejecting `-c` with output only on stderr and a non-zero exit.

## Remaining gates

- The independent review above.
- Handoff to the coordinator, integration into `dev`, and the archive.
