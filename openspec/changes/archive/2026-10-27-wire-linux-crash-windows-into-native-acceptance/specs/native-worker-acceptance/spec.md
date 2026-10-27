## ADDED Requirements

### Requirement: Linux crash windows in native acceptance
On a Linux host the Linux entry of `make native-acceptance` SHALL run the crash windows and the duplicate delivery through `make verify-linux-crash-windows` as the proofs `acceptance-crash-windows` (process ownership) and `acceptance-duplicate-delivery` (connectivity), and their scenario records SHALL carry the proof's acceptance context. On any other host it SHALL report both proofs as not applicable, on standard error and in the run's last line, without failing the run.

#### Scenario: Linux host
- **WHEN** `make native-acceptance RESULTS=results.jsonl` runs the Linux entry on a Linux host
- **THEN** `results.jsonl` gains `acceptance-crash-windows` and `acceptance-duplicate-delivery` with target `harness-composition`, and each scenario record of `make verify-linux-crash-windows` carries the same acceptance context

#### Scenario: macOS host
- **WHEN** the Linux entry runs on a macOS host
- **THEN** both proofs are reported as not applicable on Darwin, no result is recorded for them, and the run fails only if another proof failed
