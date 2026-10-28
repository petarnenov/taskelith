## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and paste it into `design.md`

## 2. Linux cgroup supervisor in the G2 scenarios

- [x] 2.1 Move the Linux launch settings and the execution account admission to `@taskelith/testing`, used by the crash-window harness and the scenario installation
- [x] 2.2 Generalize the privileged runner (test files, Toxiproxy URLs) and add `make verify-linux-g2-scenarios`
- [x] 2.3 Add the containment guard to races c and h and make the cancel signal follow the launch host; record the fail-before runs
- [x] 2.4 Export `supervisionHost` from `apps/worker/src/execution-supervision.ts`, with unit tests
- [x] 2.5 Launch the scenario workers, the crash-before-ack worker included, through it under the Linux launch environment
- [x] 2.6 Revert proof of the B2 fix (`scope-execution-cancellation`) with race h

## 3. Native acceptance

- [x] 3.1 Add `acceptance-cancellation-races` and `acceptance-partition` to the Linux entry, not applicable off Linux, with runner tests
- [x] 3.2 Update `docs/local-installation.md`, `docs/worker-platforms.md`, the item 43 rows of `docs/g3-plan.md`, and ADR 0015
- [x] 3.3 Run `make native-acceptance ENTRIES=linux` with two seeds on this host; record `results.jsonl` and `acceptance.md`
- [x] 3.4 Record the hosted arm64 runner finding

## 4. Verification and review

- [x] 4.1 Run strict validation of this change, `make findings ARGS="validate"`, and `make verify`; record `verification.md`
- [x] 4.2 Review pass 1 by reviewer A, recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`
- [x] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [x] 4.4 Review pass 3 by reviewer A, if pass 2 leaves fixes to confirm

## 5. Archive

- [ ] 5.1 Archive the change in the last commit of the branch, link `docs/g3-plan.md`, `docs/worker-platforms.md`, and ADR 0015 to the archived `acceptance.md`, and record the archive checks
