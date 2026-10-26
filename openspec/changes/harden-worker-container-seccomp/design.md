# Design: harden the worker container against the execution account's namespace escape

## Context

Item 23b runs the Compose `worker` service as root with `cap_drop: [ALL]` and `cap_add: [CHOWN, DAC_OVERRIDE, KILL, SETGID, SETPCAP, SETUID, SYS_ADMIN]`, `security_opt: [apparmor=unconfined, no-new-privileges=true]`, `cgroup: private`, and `init: true`. The entrypoint remounts `/sys/fs/cgroup` read-write, delegates a cgroup v2 subtree (`init/` for the worker, `executions/` for executions), then runs the worker through `setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs`. Executions are spawned by the worker (`NodeSpawner`, `child_process.spawn` with `uid`/`gid` 10003), so they inherit the worker's bounding set `e0` and `no_new_privs=1`, with every effective capability cleared on the uid change.

`CAP_SYS_ADMIN` is required only by the entrypoint, to remount `/sys/fs/cgroup` read-write for the delegation. But Docker configures the container's seccomp filter once, at container start, from the container's capability set; the filter cannot see a process's uid or its later bounding-set drop. Docker's default (builtin) profile un-gates `unshare`, `setns`, `mount`, `clone` with namespace flags, and `clone3` whenever the container holds `CAP_SYS_ADMIN`. So every process of the container, executions included, can call them.

## Reproduction (2026-10-26, Apple Silicon macOS, Docker Desktop)

Host: `docker info` → `aarch64 / Docker Desktop`, server 29.6.1, `SecurityOptions: name=seccomp,profile=builtin name=cgroupns`. Image: `taskelith-worker` built by `scripts/installation.sh build` (the same Dockerfile and pins as `make installation-build`). The worker container ran with the exact item 23b security settings; an execution was reproduced faithfully as a child of the worker's `setpriv` by running `docker exec rr-worker setpriv --bounding-set=-all,+setuid,+setgid,+kill --reuid=10003 --regid=10003 --clear-groups -- bash -c '<commands>'`, where `rr-worker` was the probe container and `<commands>` the block below. The container's `no-new-privileges=true` applies to that process.

Container processes: a process found by `pgrep` in the standalone probe container showed `CapPrm`/`CapEff`/`CapBnd` `00000000002001e3` (the container's seven capabilities, so a process outside the entrypoint's `setpriv`, such as Docker's init), `NoNewPrivs 1`, `Seccomp 2`, `Seccomp_filters 1`; the worker process itself has `CapPrm`/`CapEff`/`CapBnd` `00000000000000e0`, as `check_containment` checks in the smoke and the phase 2 scenario.

Faithful execution (uid 10003, `CapBnd 00000000000000e0`, `CapEff 0`, `NoNewPrivs 1`, `Seccomp 2`), the exact commands of the block and their outputs:

```
$ cat /proc/sys/user/max_user_namespaces
31337
$ unshare -U true 2>&1; echo "rc=$?"
rc=0
$ unshare -m true 2>&1; echo "rc=$?"
unshare: unshare failed: Operation not permitted
rc=1
$ unshare -Urm bash -c "mount -t tmpfs none /mnt && echo MOUNTED && mount | grep /mnt" 2>&1; echo "rc=$?"
MOUNTED
none on /mnt type tmpfs (rw,relatime,uid=10003,gid=10003)
rc=0
$ unshare -UrmpniC --fork bash -c "echo ALLNS-ok; mount -t tmpfs none /mnt && echo tmpfs-ok" 2>&1; echo "rc=$?"
ALLNS-ok
tmpfs-ok
rc=0
$ mount --bind /tmp /mnt 2>&1; echo "rc=$?"
mount: /mnt: must be superuser to use mount.
       dmesg(1) may have more information after failed mount system call.
rc=32
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

## Decision

On 2026-10-26 the owner's delegate decided option **b1**, on behalf of the owner (away run `20261026T170116Z-opencode-68419`): option (b) in its default-derived form, a pinned copy of Docker's default seccomp profile with only the `CAP_SYS_ADMIN` namespace carve-out removed, attached to the Compose `worker` service. Phase 1 had recommended option (b) and left the shape open between this form (b1) and a smaller allow-by-default deny-list.

## Implementation (phase 2)

1. **Upstream copy.** `infra/installation/seccomp/docker-default.json` is a byte-for-byte copy of the default profile of the engine observed here (Docker Engine 29.6.1, `GitCommit` `8ec5ab3`): `vendor/github.com/moby/profiles/seccomp/default.json` at moby commit [`8ec5ab355a34b2a0e2b3238d67bdefe77fefa982`](https://github.com/moby/moby/blob/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json) (tag `docker-v29.6.1`), which vendors `github.com/moby/profiles/seccomp` v0.2.3; the [module's tagged file](https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json) has the same SHA-256, `536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74`. Re-serializing it with tab indentation reproduces it byte for byte, so the derived file keeps upstream's layout.
2. **Derived profile.** `infra/installation/seccomp/worker.json` is derived by `scripts/worker-seccomp-profile.ts` (`make worker-seccomp-profile`). The derivation removes `clone`, `clone3`, `setns`, and `unshare` from the single `SCMP_ACT_ALLOW` rule that `includes` only `CAP_SYS_ADMIN`, and removes `CAP_SYS_ADMIN` from the `excludes` of the namespace-only fallback rules: the two `clone` rules that allow `clone` only when the flags under the mask `0x7E020000` (2114060288: `CLONE_NEWNS`, `CLONE_NEWCGROUP`, `CLONE_NEWUTS`, `CLONE_NEWIPC`, `CLONE_NEWUSER`, `CLONE_NEWPID`, and `CLONE_NEWNET`) are clear, one for s390 and one for the other architectures, and the `clone3` rule that answers `ENOSYS` (38). Every other rule, including `mount`, `umount`, `umount2`, and the other `CAP_SYS_ADMIN` calls, is unchanged. `unshare` and `setns` then fall to the profile's `defaultAction` `SCMP_ACT_ERRNO` with `defaultErrnoRet` 1 (`EPERM`). The derivation refuses an upstream profile without the single allowance or without the `clone3` `ENOSYS` rule, and a derived profile in which any `SCMP_ACT_ALLOW` rule without an argument check still names a namespace call, whatever capability it depends on (review pass 1, M3), so a refresh cannot silently produce a different shape.
3. **Proof of the copy.** `test/worker-seccomp-profile.test.ts`, part of `make verify`, checks the upstream copy against the pinned SHA-256 and its layout, that `worker.json` equals the derivation, that no namespace rule mentions `CAP_SYS_ADMIN`, that `mount` and the other `CAP_SYS_ADMIN` calls stay allowed, and, rule by rule, that only the namespace names and the `CAP_SYS_ADMIN` exclusions of the namespace-only rules differ.
4. **Compose.** The `worker` service adds `seccomp=./seccomp/worker.json` to `security_opt`. Compose resolves the relative path against the project directory, `infra/installation/` (checked with a probe container started from `/`); `test/installation-composition.test.ts` pins the entry.
5. **Scenario.** `make scenario-worker-namespace-confinement` (`namespace_confinement_scenario` in `scripts/installation-scenarios.sh`) runs on a fresh throwaway project with an enrolled worker and the scenarios' ten-second process. It checks the worker's containment (`check_containment`) and that the worker container runs with the tracked profile: it reads the container's `HostConfig.SecurityOpt` with `docker inspect`, compares its `seccomp=` value with `worker.json`, and records the SHA-256 of that applied profile (`scripts/worker-seccomp-profile.ts applied`). It submits a task and, while the execution runs, reads the execution's status fields (`Uid`, `CapEff`, `CapBnd`, `NoNewPrivs`, `Seccomp`, `Seccomp_filters`) and cgroup, which must be `0::/executions/<executionId>` with the execution ID the control plane holds. As the execution account below the worker's `setpriv`, with the same status fields as the execution, it probes every namespace call of the profile: `unshare -U` and `unshare -Urm` with `mount -t tmpfs` must print `unshare failed: Operation not permitted`, `clone3` (syscall 435 through Perl) must answer `ENOSYS` (38), `clone` with `CLONE_NEWUSER | SIGCHLD` (syscall 220 on aarch64, 56 on x86_64) must answer `EPERM`, and `setns` through `nsenter --user=/proc/self/ns/user true` must print `failed: Operation not permitted`. Without the profile, with `SYS_ADMIN` and Docker's default profile, `clone3` answers `EINVAL`, the `clone` creates the child, `setns` answers `EINVAL`, and `unshare` succeeds (checked on this host with a probe container of the base image), so each probe tells the profile from a host-wide limit such as `kernel.unprivileged_userns_clone=0` or an LSM policy (review pass 1, M1 and M2). It then checks that `executions/` exists and takes a cgroup write and that the task exits 0, and records through the scenario recorder (target `compose-installation`) with the native acceptance row's platform: OS, architecture, kernel, file system, storage driver, Docker engine and Compose versions, and the worker image ID. Stub tests in `test/installation-scenarios.test.ts` cover the pass on aarch64 and x86_64 and each failure: each probe succeeding or failing otherwise, a container without the profile, a probe status other than the execution's or not the execution account's, an execution in another cgroup, an unknown architecture, a missing containment parent, a refused cgroup write, and a failed cleanup. None has a timing bound.

The profile follows the engine: a newer engine may add calls to its default profile, which this copy then refuses until it is refreshed by the procedure in `docs/local-installation.md`. That is the maintenance cost item 23b named, accepted with b1.

## Open questions

- The `worker-harnesses` variant: if the composition ever runs it with this profile, a harness that sandboxes its own tools with user namespaces, for example through bubblewrap, will have that sandbox refused; such a harness then needs its sandbox disabled, another sandbox, or a decision on the profile (review pass 1, L10).
- The composition runs only the default worker image; the `worker-harnesses` variant would get the profile as the composition's worker service, while `make qualify-harnesses` starts its own `--network none` containers without Compose and is unchanged.
- `make verify-linux-cgroup` cannot run on this aarch64 host (its guard requires an `x86_64` Docker host and the `tools/linux-cgroup` image pins linux-x64 Node). The reproduction, the scenario, and the smoke ran on Docker Desktop aarch64 only; the coordinator runs `make verify-linux-cgroup` on the x86_64 iMac. That target starts its own `--privileged` container without Compose, which disables seccomp, so it exercises the supervisor's cgroup code but not the worker profile; the profile's x86_64 check is `make scenario-worker-namespace-confinement` there. An `x86_64` Linux host with AppArmor or SELinux is not yet observed.
