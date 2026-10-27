## Why

`make verify-installation` and `make installation-start` fail on a Docker Desktop host with a nearly full virtual machine disk: the control plane never becomes healthy (G2 item 23 follow-up). The control-plane log shows `the broker could not ensure the streams` with the cause `insufficient storage resources available`. JetStream reserves each stream's `max_bytes` on creation. The five streams take the 10 GiB target each, 50 GiB in all, and without `max_file_store` NATS sizes its file store to 75% of the free disk (18.48 GB on the reporting host, a 2020 Intel iMac). The control plane then exits and restarts in a loop, and the start reports only that it is unhealthy.

## What Changes

- The installation's NATS configuration fixes `max_file_store` at 8 GiB, and the control plane takes `TASKELITH_STREAM_MAX_BYTES`, which the installation sets to 1 GiB, so the five streams reserve 5 GiB. The 10 GiB target stays the default.
- `ensureStreams` reports a refused reservation with the bytes the streams reserve and what to change.
- `installation-start` stops the control plane and prints its last error when it does not become healthy; `verify-installation` prints the control-plane log before it removes a failed project.
- `docs/operational-targets.md` records the local values as provisional for G6; `make verify` checks that the reservation fits the fixed file store.

## Impact

- Specs: `local-installation`, `nats-transport`.
- Code: `infra/installation/`, `scripts/installation.sh`, `apps/control-plane/src/composition/settings.ts`, `packages/adapters/nats/src/topology.ts`, and their tests.
- No published package changes: `@taskelith/control-plane` and `@taskelith/nats` are private.
