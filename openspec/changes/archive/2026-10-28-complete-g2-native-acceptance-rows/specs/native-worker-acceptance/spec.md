## ADDED Requirements

### Requirement: Linux cancellation and connectivity scenarios in native acceptance
On a Linux host the Linux entry of `make native-acceptance` SHALL run the G2 cancellation races and stale generations as `acceptance-cancellation-races` (cancellation) and the partitions as `acceptance-partition` (connectivity) through `make verify-linux-g2-scenarios`, whose records SHALL carry the proof's acceptance context. On any other host it SHALL report both as not applicable without failing the run.

#### Scenario: Linux host
- **WHEN** `make native-acceptance RESULTS=results.jsonl` runs the Linux entry on a Linux host
- **THEN** `results.jsonl` gains `acceptance-cancellation-races` and `acceptance-partition` with target `harness-composition`, and each scenario record of those proofs carries the same acceptance context

#### Scenario: macOS host
- **WHEN** the Linux entry runs on a macOS host
- **THEN** both proofs are reported as not applicable on Darwin, on standard error and in the run's last line, no result is recorded for them, and the run fails only if another proof failed
