## 1. Results recorder

- [x] 1.1 Add `scenarioResult`, `FileScenarioRecorder`, `discardingScenarioRecorder`, `runEnvironment`, and `scenarioRecorderFromEnvironment` to `@taskelith/testing`, recording JSON lines to the file that `TASKELITH_SCENARIO_RESULTS` names
- [x] 1.2 Unit tests of the recorder: fields, validation, appending, the opt-in variable, and the commit

## 2. Compose scenarios

- [ ] 2.1 Fresh-composition happy path on an arm64 host: submit, assign, execute, and check the persisted result
- [ ] 2.2 Worker disk loss in the Compose installation, ending in re-enrolment of a new worker, with the old attempt `uncertain`
- [ ] 2.3 Untimed `SIGKILL` of the worker container, restart, and a check of reconciliation
- [ ] 2.4 Record each scenario's result in `results.jsonl` of this change

## 3. Records

- [ ] 3.1 Run `make verify` and the scenario evidence runs
- [ ] 3.2 Independent review and `verification.md`
