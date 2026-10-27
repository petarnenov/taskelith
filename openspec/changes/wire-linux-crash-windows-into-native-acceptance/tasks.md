## 1. Change

- [x] 1.1 Gate: confirm that the omission is not documented as intended
- [x] 1.2 Create the change `wire-linux-crash-windows-into-native-acceptance`, with empty `findings.jsonl` and `passes.jsonl`

## 2. Implementation

- [x] 2.1 Fail-before tests of the Linux entry, the run's last line, and the container's acceptance context, run on `bd6108d4`
- [x] 2.2 Run the two crash-window proofs in the Linux entry on a Linux host and report them not applicable elsewhere
- [x] 2.3 `SKIP_PATTERN` for `make verify-linux-crash-windows`; pass `TASKELITH_ACCEPTANCE` into its container
- [x] 2.4 Update `docs/local-installation.md`

## 3. Evidence

- [x] 3.1 Real `make native-acceptance` run on this Linux host into a scratch results file
- [x] 3.2 `make verify`
- [x] 3.3 Record `verification.md`

## 4. Review and archive

- [x] 4.1 Independent review (pass 1, reviewer A, Low-only)
- [ ] 4.2 Archive the change
