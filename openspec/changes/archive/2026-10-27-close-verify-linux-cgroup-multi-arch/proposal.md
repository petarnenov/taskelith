## Why

ADR 0015 decision 5 lists "Multi-architecture `make verify-linux-cgroup`" as a non-blocking follow-up owned by the coordinator, from the 24a record `2026-10-26-run-g2-failure-scenarios-composition` (its `verification.md:83` and `design.md:31`). Commit `73c0b2f7` (2026-10-26 21:24 +0200), which postdates that record, already makes the Linux test image take the pinned Node.js tarball of the Docker host's architecture, and 25b (arm64) and 25c (x86_64) ran the target natively on both architectures. Coordinator Niki decided on 2026-10-27 (option A) to close the follow-up with documentation only.

## What Changes

- **ADR 0015.** The follow-up's bullet keeps its sentence and gains a resolution note: resolved by `73c0b2f7`, with the native evidence of 25b and 25c, the dependency register row of the Ubuntu image, the `native-worker-acceptance` requirement "Linux test image per architecture", and this change's fresh x86_64 run. Cross-architecture runs on one host through QEMU emulation are not claimed and not planned.
- **Foundation ledger.** The `docs/foundation.md` row that lists the same follow-up gains the same resolution in short.
- **Fresh evidence.** `make verify-linux-cgroup` runs on a Linux x86_64 host and is recorded in `verification.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `foundation-closure` requirement "G2 closure" already requires that the closure ADR and the foundation ledger record each unfinished item, and the `native-worker-acceptance` requirement "Linux test image per architecture" already states the behavior, so the change is documentation only and sets `skip_specs: true`.

## Impact

`docs/decisions/0015-g2-closure.md` (the bullet "Multi-architecture `make verify-linux-cgroup`" only) and `docs/foundation.md` (the row "Hosted-runner Linux x86_64 check; multi-architecture `make verify-linux-cgroup`" only). No code, Makefile, image, contract, dependency, or spec changes; the published package does not change. Commit type `docs`.
