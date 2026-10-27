## Why

`make native-acceptance` runs the G2 crash windows and the duplicate delivery only in its macOS entry (`harness_proofs` in `scripts/native-acceptance.sh`). Its Linux entry omits `make verify-linux-crash-windows`, the only way these scenarios run on Linux, so a native acceptance run on a Linux host leaves those rows unproven. The archived change `run-g2-crash-windows-on-linux` names this as a limitation carried to `close-g2` (its `design.md:31` and `verification.md:92,126`); it is not a deliberate decision.

## What Changes

- On a Linux host the Linux entry runs `make verify-linux-crash-windows` twice, as the macOS entry splits its composition: `acceptance-crash-windows` (process ownership, `SKIP_PATTERN=redelivered`) and `acceptance-duplicate-delivery` (connectivity, `PATTERN=redelivered`), each recorded like every other proof.
- On a macOS host the Linux entry reports both proofs as not applicable on standard error and in the run's last line; nothing is skipped silently and the run does not fail for them.
- `make verify-linux-crash-windows` gains `SKIP_PATTERN`, and `scripts/linux-crash-windows.sh` passes `TASKELITH_ACCEPTANCE` into the container when it is set, so the scenario records carry the proof's acceptance context.
- `docs/local-installation.md` describes both.

## Capabilities

### New Capabilities

### Modified Capabilities

- `native-worker-acceptance`: adds the requirement "Linux crash windows in native acceptance".

## Impact

Test tooling only: `scripts/native-acceptance.sh`, `scripts/linux-crash-windows.sh`, the `verify-linux-crash-windows` target of the `Makefile`, two test files, and `docs/local-installation.md`. No product code and no published package content change. Both targets keep working standalone.
