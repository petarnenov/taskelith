# Verification: harden-worker-container-seccomp (phase 1, 25a)

G2 work item 25, first part (25a): decide a seccomp profile for the item 23b worker container and check userns/mount under the execution account ([docs/g2-plan.md](../../../docs/g2-plan.md) item 25; item 23b residual risk `compose-installation-end-to-end` verification.md finding M2). Phase 1 reproduces the risk, evaluates the options, and records a recommendation pending the owner's decision. No fix is implemented in this phase.

## Environment

- Host: Apple Silicon macOS (Darwin 25.6.0), Docker Desktop (arm64 Linux VM). `docker info` → `aarch64 / Docker Desktop`, server 29.6.1, `SecurityOptions: name=seccomp,profile=builtin name=cgroupns`.
- Node.js 24.22.1 (`.nvmrc`), via `nvm use`.
- Worker image built by `scripts/installation.sh build` with the `make installation-build` pins (Ubuntu 24.04 digest, Node 24.22.1 tarball SHA-256).

## Reproduction commands and outputs

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

## Options tested

- (a) Default: reproduced `MOUNTED`.
- (b) Custom seccomp profile (deny `unshare`/`setns` EPERM, `clone3` ENOSYS): the container came up, cgroup delegation produced `executions/`, `node` spawned children, and the uid-10003 execution's `unshare -U`/`-Urm`+`mount` failed with `Operation not permitted`. `make installation-smoke` with the profile on the `worker` service passed end to end (enrolled, `check_containment` passed, execution exited 0, result stored).
- (c) `--sysctl user.max_user_namespaces=0`: rejected by `docker run`; `/proc/sys/user/max_user_namespaces` read-only inside the container. Unavailable under Docker Desktop.
- (d) `SYS_ADMIN` drop: the worker already has `CapBnd e0` yet the escape reproduces (seccomp fixed at container start).

See `design.md` for the full options table and the recommendation (option b), pending the owner's decision.

## Gates

- `make installation-smoke` with the recommended profile: PASS (via `scripts/installation.sh smoke`).
- `make verify-linux-cgroup`: NOT RUN — the target requires an `x86_64` Docker host (its guard, and the `tools/linux-cgroup` image pins linux-x64 Node); this host is aarch64. Reported, tooling unchanged.
- `make verify`: not run in this phase (no source change beyond the OpenSpec change documents).

## Remaining gates / open items

- Owner decision on the option and, for (b), the profile shape (default-derived vs. deny-list).
- Phase 2 implements the chosen option, adds the tracked profile and `security_opt`, updates `docs/local-installation.md`, and re-runs the smoke; then independent review.
- An `x86_64` Linux host with AppArmor or SELinux is not yet observed (Docker Desktop aarch64 only).

## Independent review

Not yet performed (phase 1 is evidence and recommendation only).
