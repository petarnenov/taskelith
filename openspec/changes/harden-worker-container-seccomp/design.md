# Design: harden the worker container against the execution account's namespace escape

## Context

Item 23b runs the Compose `worker` service as root with `cap_drop: [ALL]` and `cap_add: [CHOWN, DAC_OVERRIDE, KILL, SETGID, SETPCAP, SETUID, SYS_ADMIN]`, `security_opt: [apparmor=unconfined, no-new-privileges=true]`, `cgroup: private`, and `init: true`. The entrypoint remounts `/sys/fs/cgroup` read-write, delegates a cgroup v2 subtree (`init/` for the worker, `executions/` for executions), then runs the worker through `setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs`. Executions are spawned by the worker (`NodeSpawner`, `child_process.spawn` with `uid`/`gid` 10003), so they inherit the worker's bounding set `e0` and `no_new_privs=1`, with every effective capability cleared on the uid change.

`CAP_SYS_ADMIN` is required only by the entrypoint, to remount `/sys/fs/cgroup` read-write for the delegation. But Docker configures the container's seccomp filter once, at container start, from the container's capability set; the filter cannot see a process's uid or its later bounding-set drop. Docker's default (builtin) profile un-gates `unshare`, `setns`, `mount`, and `clone` with namespace flags whenever the container holds `CAP_SYS_ADMIN`. So every process of the container, executions included, can call them.

## Reproduction (2026-10-26, Apple Silicon macOS, Docker Desktop)

Host: `docker info` → `aarch64 / Docker Desktop`, server 29.6.1, `SecurityOptions: name=seccomp,profile=builtin name=cgroupns`. Image: `taskelith-worker` built by `scripts/installation.sh build` (the same Dockerfile and pins as `make installation-build`). The worker container ran with the exact item 23b security settings; an execution was reproduced faithfully as a child of the worker's `setpriv` by running, inside the container, `setpriv --bounding-set=-all,+setuid,+setgid,+kill --reuid=10003 --regid=10003 --clear-groups -- bash -c '…'`. The container's `no-new-privileges=true` applies to that process.

Worker process (`/proc/<pid>/status`): `CapPrm`/`CapEff`/`CapBnd` `00000000002001e3` while it holds `SYS_ADMIN` and `SETPCAP` (the standalone probe left the container command under the entrypoint's `setpriv`; in the real smoke the worker service shows `CapBnd` `e0`), `NoNewPrivs 1`, `Seccomp 2`, `Seccomp_filters 1`.

Faithful execution (uid 10003, `CapBnd 00000000000000e0`, `CapEff 0`, `NoNewPrivs 1`, `Seccomp 2`):

```
$ cat /proc/sys/user/max_user_namespaces        → 31337   (nonzero: userns allowed)
$ unshare -U true                               → rc=0
$ unshare -m true                               → unshare failed: Operation not permitted (rc=1)
$ unshare -Urm bash -c 'mount -t tmpfs none /mnt && echo MOUNTED'
      → MOUNTED; none on /mnt type tmpfs (rw,relatime,uid=10003,gid=10003)   (rc=0)
$ unshare -UrmpniC --fork bash -c 'echo ALLNS-ok; mount -t tmpfs none /mnt'
      → ALLNS-ok; tmpfs-ok   (rc=0)
$ mount --bind /tmp /mnt                        → must be superuser (rc=32)   (no userns: blocked)
```

So the residual risk is confirmed: an execution with no capabilities and `no_new_privs=1` can still `unshare -U` (user namespace), then become root inside it and `unshare -m` + `mount -t tmpfs`, and can create every other namespace too (`-pniC`). Without the user namespace, `mount` and `mount --bind` fail (the kernel still checks capabilities against the host namespaces, so the worker's cgroups and files stay out of reach — the containment holds). The reachable kernel surface is that of unprivileged user namespaces. Docker's default profile (option a) is in effect and does not block this while the container holds `CAP_SYS_ADMIN`.

## Options

Scope of 25a: only the private worker image and Compose may change; product code (`apps/worker`, the supervisor adapters) is out of scope. Each option is judged on whether it blocks the reproduction for uid 10003 while leaving the worker's own needs intact: the entrypoint's `/sys/fs/cgroup` remount and cgroup delegation, the worker's child spawning (`clone`/`fork`), the journal (SQLite), and the NATS and control-plane connections.

| Option | Blocks the escape? | Cost | Risk | Reversibility | Needs product code? |
|---|---|---|---|---|---|
| (a) Docker default seccomp as is | No (tested: `MOUNTED`). `SYS_ADMIN` un-gates `unshare`/`mount`/`clone` for the whole container | None | Leaves the risk open | n/a | No |
| (b) Custom seccomp profile on the `worker` service denying namespace creation (`unshare`, `setns`, `clone` with `CLONE_NEW*`, `clone3`), `mount` left allowed for the entrypoint | Yes (tested) | A tracked JSON profile and one `security_opt` line | Must track the shape against the engine/arch; a hand-written allow-list loses the rest of the default profile's denials, so the robust form is the default profile with the `SYS_ADMIN` namespace carve-out removed | High: delete the `security_opt` line and the file | No |
| (c) `user.max_user_namespaces=0` in the container | n/a (unavailable) | — | `--sysctl user.max_user_namespaces=0` is rejected by Docker ("not allowed"), and `/proc/sys/user/max_user_namespaces` is a read-only filesystem in the container, so neither Compose nor the entrypoint can set it under Docker Desktop. Only the Docker Desktop VM host could, globally | n/a | No |
| (d) Drop `SYS_ADMIN` after cgroup setup | No | — | The worker's bounding set already drops `SYS_ADMIN` via `setpriv` (`CapBnd e0`), yet the escape still works, because the seccomp filter is fixed at container start from the container's capability set and does not re-evaluate. Removing `SYS_ADMIN` from the container would also break the entrypoint's remount | n/a | No (but cannot work) |
| (e) Per-execution seccomp filter applied by the launcher | Yes (in principle) | A BPF filter installed by `NodeSpawner` before `exec`, scoped to executions only, so the worker keeps full syscall access | Narrowest blast radius, but it is product code | n/a | Yes — out of 25a scope |

### Tested effects

- (a) Default: reproduced the `MOUNTED` escape above. Confirmed the builtin profile is in effect (`Seccomp 2`).
- (b) Custom profile: ran the worker with `--security-opt seccomp=<profile>` where the profile is `defaultAction: SCMP_ACT_ALLOW` plus `unshare`/`setns` → `SCMP_ACT_ERRNO` (EPERM) and `clone3` → `SCMP_ACT_ERRNO` (ENOSYS, so glibc falls back to `clone`). Result: the container came up, the cgroup delegation produced `executions/`, `node` spawned children (`spawn ok`), and as the faithful uid-10003 execution `unshare -U` and `unshare -Urm`+`mount` both failed with `Operation not permitted`. `make installation-smoke` (via `scripts/installation.sh smoke`) with this profile wired into the `worker` service's `security_opt` passed end to end: the worker enrolled, `check_containment` passed, the execution ran as uid 10003 and exited 0, and the result was stored. Note: the allow-by-default test profile does not restrict `clone(CLONE_NEWUSER)` from a compiled program (seccomp cannot express "deny if any namespace flag is set" under an allow default); the robust production form is Docker's default profile with the `CAP_SYS_ADMIN` namespace carve-out removed, which keeps `clone`'s namespace-flag restriction and the default's other denials.
- (c) `--sysctl user.max_user_namespaces=0`: rejected by `docker run` ("sysctl 'user.max_user_namespaces=0' is not allowed"). Writing `/proc/sys/user/max_user_namespaces` as root-with-`SYS_ADMIN` inside the container: `Read-only file system`. Unavailable under Docker Desktop.
- (d) Confirmed the worker already runs with `CapBnd e0` yet the escape reproduces, because the filter is set once at container start.

## Recommendation (PENDING the owner's decision)

Recommend option (b): a custom seccomp profile on the Compose `worker` service that denies user- and mount-namespace creation. It is the only option that blocks the reproduction and fits 25a's scope (no product code; Docker Desktop forecloses (c); (d) cannot work; (e) needs product code). The profile leaves `mount` allowed so the entrypoint's cgroup remount keeps working, and denies namespace creation, which the worker, supervisor, journal, and broker connections do not use (the smoke confirms it).

The owner's remaining choice is the profile's shape: the robust form is Docker's default profile (for the target engine and architecture) with the `CAP_SYS_ADMIN`-conditional namespace allowances removed, which preserves the rest of the default's hardening at the cost of tracking the engine's profile — exactly the maintenance cost item 23b flagged. A smaller allow-by-default deny-list is simpler but loses the default's other denials and cannot restrict raw `clone` namespace flags. If the owner judges the residual risk acceptable, option (a) keeps the status quo with no change.

Phase 2 implements the chosen option.

## Open questions

- Which profile shape (default-derived vs. deny-list), decided by the owner.
- Whether item 25 also wants the user namespace closed for the `worker-harnesses` variant identically (same base image and settings, so the profile applies unchanged).
- `make verify-linux-cgroup` cannot run on this aarch64 host (its guard requires an `x86_64` Docker host and the `tools/linux-cgroup` image pins linux-x64 Node). The reproduction and smoke ran on Docker Desktop aarch64 only; an `x86_64` Linux host with AppArmor or SELinux is not yet observed.
