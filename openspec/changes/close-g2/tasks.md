## 1. Draft

- [x] 1.1 Map every G2 plan row to its archived changes and list the rows not archived.
- [x] 1.2 Draft ADR 0015 with the exit evidence and native acceptance placeholders, the deferrals, and the closure placeholder.
- [x] 1.3 Prepare the G2 section of the foundation ledger with placeholders; add the `foundation-closure` delta.

## 2. Evidence from the changes in progress

- [ ] 2.1 Fill the 24c `run-g2-partition-and-races` placeholder: scenarios, `results.jsonl` lines, commit, host, open rows.
- [x] 2.2 Fill the 25c `run-g2-native-acceptance-x86_64` placeholder for `macos-26-x86_64` and `linux-ubuntu-24.04-x86_64` under Docker Desktop.
- [x] 2.3 Fill the `run-g2-native-acceptance-linux-host` placeholder, and resolve or assign the AppArmor or SELinux, Linux crash-window, duplicate-delivery, and supplementary-groups deferrals.
- [x] 2.4 Record whether the macOS arm64 process ownership row was re-run after `fix-launch-recovery-reauthorization`.
- [ ] 2.5 Update the row map with the archive names and dates of these changes and any fix changes they produce.
- [x] 2.6 Resolve or keep the `bound-failure-cause-userinfo-redaction` and `keep-coverage-out-of-killed-test-processes` deferrals.
- [x] 2.7 Fill the blocking and deferred items the coordinator named on 2026-10-27; keep each without a record marked as the coordinator's statement.
- [ ] 2.8 After each blocker of ADR 0015 decision 5 lands (24c, the fix of L1, the ReDoS fix, the macOS arm64 re-run) and each branch marked "integration pending" is integrated, check the ADR's evidence against `dev` and replace the integration notes.

## 3. Fresh-clone reproduction

- [ ] 3.1 `git clone` the repository into a scratch directory outside it, check out `dev` after the changes above are archived, `nvm use`, and `make setup`.
- [ ] 3.2 Run `make verify` and record tests, coverage, and checks.
- [ ] 3.3 Run `make verify-installation`, the installation smoke (`make installation-smoke`), and the native acceptance targets as 25b and 25c ran them, and record the results.
- [ ] 3.4 Check `git status --short` afterwards and record host and toolchain; fill the ADR's fresh-clone placeholder.

## 4. Closure records

- [ ] 4.1 Have the owner confirm each author's assignment in ADR 0015.
- [ ] 4.2 Replace the closure placeholder; update the foundation ledger, the G2 work plan status, architecture sections 13 and 15, README, and the protocol version note in `docs/contracts/execution-wire-contracts.md` section 5.
- [ ] 4.3 Check that no placeholder remains in ADR 0015 or the ledger.

## 5. Verification and review

- [ ] 5.1 Run `make verify` and the link and evidence checks.
- [ ] 5.2 Obtain independent review (OpenCode `opencode-go/kimi-k3.1-pro#high`) and record results in `verification.md` and `findings.jsonl`.
- [ ] 5.3 Owner acceptance of ADR 0015; set its status.
