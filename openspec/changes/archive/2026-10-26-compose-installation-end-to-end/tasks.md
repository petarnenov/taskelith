## 1. Worker container

- [x] 1.1 Add `infra/installation/worker-entrypoint.sh`: remount `/sys/fs/cgroup` read-write, move every process into `init/`, create `executions/`, hand the data root to root, and run the worker through `setpriv` with `SETUID`, `SETGID`, and `KILL` only
- [x] 1.2 Worker image: the `taskelith-exec` account (10003), `TASKELITH_CONTAINMENT_PARENT`, `TASKELITH_EXECUTION_UID`, `TASKELITH_EXECUTION_GID`, and the entrypoint
- [x] 1.3 Compose `worker` service: `user: "0:0"`, `cgroup: private`, `cap_drop: [ALL]` with the entrypoint's seven capabilities, `no-new-privileges`, `apparmor=unconfined`, and `init: true`

## 2. Smoke

- [x] 2.1 `infra/installation/smoke/compose.yaml` and `workflows.json`: the test-only workflow and scripted process
- [x] 2.2 `scripts/installation-smoke.ts`: create a run, submit a planning task, and wait for an ended result that exited with code 0
- [x] 2.3 `installation.sh smoke` and `make installation-smoke` on the throwaway project `<installation>-smoke`, removed with its volumes and images, with the logs printed on failure

## 3. Tests and records

- [x] 3.1 Tests of the entrypoint, the smoke client, the smoke workflow, and the worker service's settings and image environment
- [x] 3.2 Update `docs/local-installation.md`
- [x] 3.3 Run `make installation-smoke`, `make verify-installation`, and `make verify`
- [x] 3.4 Independent review and `verification.md`
