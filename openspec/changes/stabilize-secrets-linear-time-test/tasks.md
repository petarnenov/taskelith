## 1. Change

- [x] 1.1 Create the change `stabilize-secrets-linear-time-test` and save the checklist

## 2. Diagnosis

- [x] 2.1 Find the failing test, its message, and its time in the saved `make verify` logs
- [x] 2.2 Measure how the redactor's time grows with the run length on every unit of the three tests
- [x] 2.3 Run the old tests under 8 busy loops

## 3. Implementation

- [x] 3.1 Judge growth from medians of CPU time of a short and a long run in `assertLinearOnRuns`
- [x] 3.2 Cover both runs, a paused sample, and a quadratic redactor in the helper's tests
- [x] 3.3 Add the `deterministic-test-harness` requirement "Linear-time assertions"

## 4. Verification

- [x] 4.1 Fail-before run of the helper's new tests against the old helper
- [x] 4.2 Mutation controls: the helper's quadratic redactor and a quadratic `mergedSpans`
- [x] 4.3 Thirty runs of the three secrets tests, fifteen under 8 busy loops
- [x] 4.4 `make verify`, `make record`, and `make record-check`

## 5. Review and archive

- [ ] 5.1 Independent review pass 1
- [ ] 5.2 Independent review pass 2
- [ ] 5.3 Archive the change
