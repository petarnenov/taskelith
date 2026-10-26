## 1. Results recorder

- [x] 1.1 Add `scenarioResult`, `FileScenarioRecorder`, `discardingScenarioRecorder`, `runEnvironment`, and `scenarioRecorderFromEnvironment` to `@taskelith/testing`, recording JSON lines to the file that `TASKELITH_SCENARIO_RESULTS` names
- [x] 1.2 Unit tests of the recorder: fields, validation, appending, the opt-in variable, and the commit

## 2. Compose scenarios

- [x] 2.1 Fresh-composition happy path on an arm64 host: submit, assign, execute, and check the persisted result
- [x] 2.2 Worker disk loss in the Compose installation: the worker refuses a missing journal, and after the whole data root is lost and the worker revoked, a new worker enrolls, the old execution stays `started` with uncertain evidence, and a new task exits 0
- [x] 2.3 Untimed `SIGKILL` of the worker container, restart, and a check of reconciliation
- [x] 2.4 Record each scenario's result in `results.jsonl` of this change

## 3. Records

- [x] 3.1 Run `make verify` and the scenario evidence runs
- [ ] 3.2 Independent review and `verification.md` (pass 1 findings fixed; pass 2 pending)
