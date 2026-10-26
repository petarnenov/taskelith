## Scope and source

`fix-native-lifecycle-stat-on-linux`, assigned by the coordinator on 2026-10-26 after it found the defect during G2 work item 24c: the native worker lifecycle tests of `test/installation-scenarios.test.ts` (from #306, commit `895cdf7`) fail deterministically on Linux. In scope: `mode_of()` in `scripts/installation-scenarios.sh`, with the GNU-first order the coordinator specified. Excluded: every other part of the scenario script and its tests.

## Revision and environment

- Base: `origin/dev` at `a38aefc`. Branch `fix-native-lifecycle-stat-on-linux`. The fix is `da3f013`, the change documents `7602c4b` (the reviewed revision). `origin/dev` was merged in as `ff9e86f`; it brought only #310 `streamline-task-integration` (documentation, the pre-push hook and its test), no verification input of this fix. The unreviewed fix of the Low finding L2 is `7454269`.
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
| The three native lifecycle tests at `7454269`, after the merge and the L2 fix | Passed: 3 tests, 3 passed, 0 failed; the whole `test/installation-scenarios.test.ts`: 40 tests, 40 passed |
| `make verify` of `7454269` | Passed: 1923 tests, 1879 passed, 0 failed, 44 skipped; coverage of all files 99.19% lines, 91.82% branches, 98.79% functions; OpenSpec 70 passed; `verify:archive` and `verify:package` passed; B6 did not occur |

## Archive

Checked state: the tree of the archive commit `docs: archive the native lifecycle stat on Linux change`, the working tree the checks below ran on, after `npm run openspec -- archive fix-native-lifecycle-stat-on-linux --yes` moved this change to `openspec/changes/archive/2026-10-26-fix-native-lifecycle-stat-on-linux/` with every task done.

| Check | Result |
| --- | --- |
| `npm run openspec -- validate --all --strict` | Passed: 69 passed, 0 failed |
| `make verify` | Passed: 1923 tests, 1879 passed, 0 failed, 44 skipped; coverage of all files 99.18% lines, 91.81% branches, 98.79% functions; OpenSpec 69 passed; `verify:archive` and `verify:package` passed; B6 did not occur |
| This change's line in `npm run openspec -- validate --archived --no-interactive` | `✓ change/2026-10-26-fix-native-lifecycle-stat-on-linux` |
| `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` | Empty, as `skip_specs: true` intends |

## Review

### Pass 1

- Invocation, run from the worktree with the prompt and the log outside it: `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k2.7-code' --format json --title fix-native-lifecycle-stat-on-linux "$(cat <prompt-file>)" < /dev/null > <log>`.
- Model confirmation: providerID `opencode-go`, model `kimi-k2.7-code`, variant default, from the session's stored messages in OpenCode's database.
- Session `ses_e85f13299ffe06CZQLgkufkSjm`; reviewed revision `7602c4b`.
- Snapshot before and after identical: `df2f30df104e919f057a3def64e50a99c07a39d59868bcee3cebee2378c2e444`.
- The CLI exited with code 1 after it delivered the complete report. The reviewer had no shell, so it reviewed the working tree, not `git diff`.
- Findings: 0 Critical, 0 High, 0 Medium, 2 Low.
  - L1, `scripts/installation-scenarios.sh:633`: `volume_of()` uses `stat -f -c %T` in its non-macOS branch. Resolution: no change. The branch runs only on Linux, where GNU stat is expected, and macOS uses `diskutil`; the reviewer called it out of scope and not breaking.
  - L2, `scripts/installation-scenarios.sh:639`: `native_identity()` uses `shasum`, which minimal Linux systems may lack. Resolution: fixed in `7454269`; it prefers `sha256sum` when it exists, otherwise `shasum -a 256`. **Unreviewed fix**: the pass was Low-only, so it is fixed without another review.

## Limitations

- macOS was not re-run here; the BSD path relies on BSD stat rejecting `-c` with output only on stderr and a non-zero exit.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
