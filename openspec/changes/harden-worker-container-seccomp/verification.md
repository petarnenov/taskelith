# Verification: harden-worker-container-seccomp (25a)

G2 work item 25, first part (25a): decide a seccomp profile for the item 23b worker container and check userns/mount under the execution account ([docs/g2-plan.md](../../../docs/g2-plan.md) item 25; item 23b residual risk `compose-installation-end-to-end` verification.md finding M2). Phase 1 reproduced the risk, evaluated the options, and recommended option (b). Phase 2 implements option b1, which the owner's delegate chose.

## Environment

- Host: Apple Silicon macOS (Darwin 25.6.0), Docker Desktop (arm64 Linux VM). `docker info` → `aarch64 / Docker Desktop`, server 29.6.1, `SecurityOptions: name=seccomp,profile=builtin name=cgroupns`.
- Node.js 24.22.1 (`.nvmrc`), via `nvm use`.
- Worker image built by `scripts/installation.sh build` with the `make installation-build` pins (Ubuntu 24.04 digest, Node 24.22.1 tarball SHA-256).

## Phase 1: reproduction commands and outputs

The worker container ran with the item 23b security settings (`--cap-drop ALL`, `--cap-add CHOWN,DAC_OVERRIDE,KILL,SETGID,SETPCAP,SETUID,SYS_ADMIN`, `--security-opt apparmor=unconfined --security-opt no-new-privileges=true`, `--cgroupns private`, `--init`). A faithful execution was reproduced as a child of the worker's `setpriv`:

```
setpriv --bounding-set=-all,+setuid,+setgid,+kill --reuid=10003 --regid=10003 --clear-groups -- bash -c '…'
```

Execution state: `Uid 10003`, `CapBnd 00000000000000e0`, `CapEff 0`, `NoNewPrivs 1`, `Seccomp 2`, `Seccomp_filters 1`.

```
cat /proc/sys/user/max_user_namespaces   → 31337
unshare -U true                          → rc=0
unshare -m true                          → Operation not permitted (rc=1)
unshare -Urm 'mount -t tmpfs none /mnt'  → MOUNTED; tmpfs on /mnt (rc=0)
unshare -UrmpniC --fork …                → all namespaces + tmpfs ok (rc=0)
mount --bind /tmp /mnt                   → must be superuser (rc=32)
```

Result: the escape reproduces (user namespace + tmpfs mount) despite no capabilities, `no_new_privs=1`, and an active seccomp filter. Docker's default profile (option a) is in effect and does not block it while the container holds `CAP_SYS_ADMIN`.

## Phase 1: options tested

- (a) Default: reproduced `MOUNTED`.
- (b) Custom seccomp profile, phase 1 test form (allow by default, deny `unshare`/`setns` EPERM, `clone3` ENOSYS): the container came up, cgroup delegation produced `executions/`, `node` spawned children, and the uid-10003 execution's `unshare -U`/`-Urm`+`mount` failed with `Operation not permitted`. `make installation-smoke` with the profile on the `worker` service passed end to end (enrolled, `check_containment` passed, execution exited 0, result stored).
- (c) `--sysctl user.max_user_namespaces=0`: rejected by `docker run`; `/proc/sys/user/max_user_namespaces` read-only inside the container. Unavailable under Docker Desktop.
- (d) `SYS_ADMIN` drop: the worker already has `CapBnd e0` yet the escape reproduces (seccomp fixed at container start).

See `design.md` for the full options table.

## Decision

On 2026-10-26 the owner's delegate decided option b1, on behalf of the owner (away run `20261026T170116Z-opencode-68419`): a pinned copy of Docker's default seccomp profile with only the `CAP_SYS_ADMIN` namespace carve-out removed, attached to the Compose `worker` service.

## Phase 2: the profile

- Upstream: Docker Engine 29.6.1 (`docker version`: `GitCommit 8ec5ab3`), moby tag `docker-v29.6.1`, commit `8ec5ab355a34b2a0e2b3238d67bdefe77fefa982`, file [`vendor/github.com/moby/profiles/seccomp/default.json`](https://github.com/moby/moby/blob/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json) (`vendor/modules.txt`: `github.com/moby/profiles/seccomp v0.2.3`); [the module's file at tag `seccomp/v0.2.3`](https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json) has the same SHA-256, `536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74`.
- `infra/installation/seccomp/docker-default.json` is that file unchanged; `infra/installation/seccomp/worker.json` (SHA-256 `10f28c01259a05ec7fc2cd61eeada3f6e9e28a3cb5be1aea4e2e4ce6e0e13c36`) comes from `make worker-seccomp-profile`. `diff -u` of the two shows only: `clone`, `clone3`, `setns`, and `unshare` removed from the `CAP_SYS_ADMIN` allowance, and the `CAP_SYS_ADMIN` exclusion removed from the two `clone` rules without namespace flags and from the `clone3` `ENOSYS` rule.
- Compose resolves `seccomp=./seccomp/worker.json` against `infra/installation/`: a probe service with `cap_add: [SYS_ADMIN]` and that relative path, run with `docker compose -f <dir>/compose.yaml run` from `/` as uid 10003, printed `Seccomp: 2` and `unshare: unshare failed: Operation not permitted`.

## Phase 2: commands and results

Each scenario ran at commit `a13894c` on 2026-10-26 with `TASKELITH_SCENARIO_RESULTS=openspec/changes/harden-worker-container-seccomp/results.jsonl`, on a fresh throwaway project that it removed before it recorded the pass; both exited 0. The records are in [results.jsonl](results.jsonl).

| Command | Seed | Result |
|---|---|---|
| `make scenario-worker-namespace-confinement` | 1907525133 | passed |
| `make scenario-fresh-composition` (runs `make installation-smoke` with the profile) | 2972196964 | passed |

Native acceptance row of the confinement scenario, as recorded: OS Docker Desktop (host Darwin 25.6.0, arm64); architecture aarch64; kernel 6.12.76-linuxkit; file system `ext2/ext3` (the worker data root, as `stat -f -c %T` names the ext family's magic number), storage driver overlay2; Docker engine 29.6.1; worker image `sha256:f05cd6248b954f52e4ba8a2ee780b43b48d6504e8c03c7484ce04e44bc51b129`; seccomp profile SHA-256 `10f28c01…0e13c36`. As uid 10003 with status `Uid: 10003 10003 10003 10003 CapEff: 0000000000000000 CapBnd: 00000000000000e0 NoNewPrivs: 1 Seccomp: 2`:

```
unshare -U true                           → unshare: unshare failed: Operation not permitted
unshare -Urm mount -t tmpfs none /mnt     → unshare: unshare failed: Operation not permitted
```

The worker kept `KILL`, `SETGID`, and `SETUID` only (`check_containment`), `executions/` existed and took a cgroup write, and a task's execution ran in `0::/executions/bed986a0-db70-4951-837e-55f4721eb7e6` and exited 0. The fresh composition stored the smoke task as ended, exited with code 0 and a proven start. Afterwards no container, image, or volume of either project remained.

## Gates

- `npm run openspec -- validate harden-worker-container-seccomp --strict`: PASS.
- `make verify`: PASS on 2026-10-26, on the tree of this documentation commit (code at `a13894c` plus these documents): 1802 tests, 1800 passed, 0 failed, 2 skipped (the existing Linux-only skips); coverage 99.26 % lines, 91.88 % branches, 98.89 % functions; the comment rule, the archive dry run, and the package check passed.
- `make scenario-worker-namespace-confinement` and `make scenario-fresh-composition`: PASS (above).
- `make verify-linux-cgroup`: N/A on this host — the target requires an `x86_64` Docker host (its guard, and the `tools/linux-cgroup` image pins linux-x64 Node); this host is aarch64, and the tooling is unchanged. The coordinator runs it on the x86_64 iMac. It starts its own `--privileged` container without Compose, which disables seccomp, so it covers the supervisor's cgroup code, not the worker profile; on x86_64 the profile is checked by `make scenario-worker-namespace-confinement`.

## Remaining gates / open items

- `make verify-linux-cgroup` and, for the profile on x86_64, `make scenario-worker-namespace-confinement` on the x86_64 iMac (coordinator).
- Independent review: pending.
- An `x86_64` Linux host with AppArmor or SELinux is not yet observed (Docker Desktop aarch64 only).
- The profile follows the engine; a newer engine's default profile is adopted by the refresh procedure in `docs/local-installation.md`.

## Independent review

Pending.
