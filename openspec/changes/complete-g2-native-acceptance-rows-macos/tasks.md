## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and paste it into `design.md`

## 2. macOS supervisor in the G2 scenarios

- [x] 2.1 Add the macOS launch switch, the launch host kinds, and their cancel signals, with unit tests
- [x] 2.2 Launch the scenario workers, the crash-before-ack worker included, through the worker's own launch host on macOS, and list leftover processes through `ps` there
- [x] 2.3 Generalize the guard of races c, g, and h to the macOS supervisor; record its fail-before run
- [x] 2.4 Run race g through the macOS supervisor; record its fail-before run
- [x] 2.5 Add `make verify-macos-g2-scenarios`

## 3. Native acceptance

- [x] 3.1 Add `acceptance-cancellation-races` and `acceptance-partition` to the macOS entry, with a runner test
- [x] 3.2 Update `docs/local-installation.md`, `docs/worker-platforms.md`, and the item 43 row of `docs/g3-plan.md`
- [x] 3.3 Run `make native-acceptance ENTRIES=macos` with two seeds on this host; record `results.jsonl` and `acceptance.md`

## 4. Verification and review

- [x] 4.1 Run strict validation of this change, `make findings ARGS="validate"`, and `make verify`; record `verification.md`
- [ ] 4.2 Review pass 1 by reviewer A, recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`
- [ ] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [ ] 4.4 Review pass 3 by reviewer A, if governance "Conditional third pass" requires it

## 5. Archive

- [ ] 5.1 Archive the change in the last commit of the branch, link `docs/g3-plan.md` and `docs/worker-platforms.md` to the archived `acceptance.md`, and record the archive checks
