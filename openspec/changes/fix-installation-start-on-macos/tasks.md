## 1. Fix

- [x] 1.1 Fix `max_file_store` at 8 GiB in `infra/installation/nats-server.conf` and set `TASKELITH_STREAM_MAX_BYTES` to 1 GiB for the control plane in `infra/installation/compose.yaml`
- [x] 1.2 Read `TASKELITH_STREAM_MAX_BYTES` in the control-plane settings, with the 10 GiB target as the default
- [x] 1.3 Map JetStream error 10047 in `ensureStreams` to a failure that names the reserved bytes
- [x] 1.4 Stop the control plane and print its last error when `installation-start` fails; print the control-plane log before `verify-installation` removes a failed project

## 2. Tests and records

- [x] 2.1 Settings test for the variable, integration test for the refused reservation, and a composition test that the reservations fit the file store
- [x] 2.2 Record the local values in `docs/operational-targets.md` and the storage requirement in `docs/local-installation.md`
- [ ] 2.3 Run `make verify` and `make verify-installation`, including a run with a small file store
- [ ] 2.4 Independent review and `verification.md`
