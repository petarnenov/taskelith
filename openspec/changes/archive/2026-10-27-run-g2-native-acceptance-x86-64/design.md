## Context

25b ([design](/openspec/changes/archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)) added `make native-acceptance`, which detects the host's matrix entries and runs the proofs of the five G2 rows (service lifecycle, process ownership, journal and storage, cancellation, and the G2 part of connectivity) on each, and it ran the arm64 entries on an Apple Silicon Mac. Its design decision 1 states that nothing in the runner depends on the architecture, so 25c runs it unchanged except for decision 6 (the build before the seed). This host is a 2020 Intel iMac (Intel Core i7-10700K, 16 logical CPUs, 40 GiB memory) with macOS 26.6.2 (25G83), Darwin 25.6.0 `x86_64`, and Docker Desktop for x86_64.

Since 25b's base (`9cec6bb`), `dev` gained `fix-launch-recovery-reauthorization`, the fix of D1, and the 24b crash windows were flipped from D1's expected failures to passing recovery (commits `8e6145e`, `1f21eb8`). 24c (`run-g2-partition-and-races`) is still not on `dev` at this change's base `843e293`, nor at `1847570` and `fe64386`, the `dev` revisions merged into the branch, the later one before the evidence run: no `run-g2-partition-and-races` change is active or archived at any of them.

## Decisions

1. **Same proofs.** The run uses 25b's runner and proof table (25b design decision 5), changed only by decision 6: on this host the runner derives `macos-26-x86_64` from `sw_vers` and `uname -m`, and `linux-ubuntu-24.04-x86_64` from the pinned base's `PRETTY_NAME` and `docker info` (`x86_64`). Any other change to the runner or a proof is out of scope; a need for one is reported to the coordinator.
2. **Native data root on the boot volume.** The worker refuses launches while its data root's volume has less free space than `max(5 GiB, 10 %)` of its size (`apps/worker/src/admission-pressure.ts`, measured with `statfs` `bavail` and `blocks` in `packages/adapters/worker-journal/src/volume.ts`). The boot data volume, which holds the temporary directory, is APFS (case-insensitive) of 931.5 GiB with 504.5 GiB available: the floor is 93.2 GiB, so the margin is about 411 GiB. `NATIVE_DATA_PARENT` is therefore not set, and the native worker's data root lies under the temporary directory on the boot volume, unlike 25b's disk image (25b design decision 7). Docker Desktop's VM disk (`/dev/vda1`, which `stat -f` reports as ext2/ext3) has about 251.7 GiB with 229 GiB available, above its floor of about 25.2 GiB, for the Linux worker's data root on a Docker volume.
3. **D1 is no longer an expected failure.** With D1's fix on `dev`, every 24b crash window and the duplicate delivery are expected to pass on the macOS entry. A failed window, like any other failed proof, is a candidate defect reported to the coordinator, not cited as D1.
4. **Evidence and table.** One run records into this directory's `results.jsonl`, emptied first; `acceptance.md` follows 25b's table (platforms, one line per row and entry, outcomes, record lines, open or failed reasons) and never reports a failed or unrun proof as passed. The commit that ran is named in every record and in `verification.md`.
5. **No dry run.** The runner has no plan or dry-run mode. The setup step checked its prerequisites instead, without writing evidence (`verification.md`, "Setup and preflight").

6. **Build before the seed.** `tool seed`, the first step of `main`, imports `@taskelith/testing` from its `dist/`, which `make setup` does not build, so a fresh worktree failed before any proof; 25b's host had a built tree. `main` now runs `build_checkout` (`npm run --silent build`) after it enters the repository and before the seed, and the macOS entry no longer builds on its own; the Linux targets keep their own builds. The runner test stubs `build_checkout` and `tool seed`, each marking its call on standard error, and checks that the build's mark directly precedes the seed's.
7. **Namespace confinement as an extra.** The runner does not run 25a's `make scenario-worker-namespace-confinement`. It runs once after `make native-acceptance`, with the same `TASKELITH_SCENARIO_RESULTS`, as a recorded extra without an acceptance context, and `acceptance.md` lists it beside the Linux x86_64 rows. 25a already passed it on this iMac (Docker Desktop 29.5.2, record `arch` `x64`, [verification](/openspec/changes/archive/2026-10-26-harden-worker-container-seccomp/verification.md)), together with `make verify-linux-cgroup` 14 of 14.

## Differences from the arm64 run

- **Images.** The installation images build the `node-amd64` stage with `node-v24.22.1-linux-x64.tar.gz`, and the Linux test image takes the same tarball; the base resolves to its linux/amd64 manifest. Both are checksum-pinned (`docs/dependencies.md`, Ubuntu row).
- **Seccomp.** The worker profile `infra/installation/seccomp/worker.json` maps `SCMP_ARCH_X86_64` with the `X86` and `X32` subarchitectures, so the x86_64 worker container runs under the same rules; the runner's scenarios start the worker with it, and the confinement extra (decision 7) probes it.
- **Engine versions.** Docker Desktop 4.75.0, Engine 29.5.2, Compose 5.1.3, older than 25b's 4.81.0, 29.6.1, and 5.2.0; both use the 6.12.76-linuxkit kernel, overlay2, and cgroup v2.
- **Host speed.** The Intel host is slower than the Apple Silicon host; the scenarios' deadlines (25b review pass 1 fix 9: a 60 s stop) were set with this host in mind.

## Rows that stay open

As in 25b ("Rows that stay open"), except where D1's fix changes the macOS process ownership row:

- **Linux composed crash windows** need a privileged composition with a delegated cgroup and network to the services.
- **Cancellation races, partition and reconnect, stale generations, stale writes** belong to 24c, not merged; duplicate delivery on Linux needs the same composition as the crash windows.
- **Service lifecycle beyond G2**: reboot, drain before upgrade, a supervisor (systemd or launchd), logout and login, and a dedicated macOS service account are G6.
- **Connectivity beyond G2**: credential rotation delivery is G3 item 26, epoch quarantine and restore are G6, and sleep and wake and network changes on macOS have no G2 procedure.

## Risks and limitations

- The Linux entry runs in Docker Desktop's Linux VM for x86_64, not on an Ubuntu host kernel; a Linux host with AppArmor or SELinux is not observed.
- Other sessions on this host may run Docker workloads at the same time; the run's projects have their own names and ephemeral ports, and timing-sensitive failures are reported with that context.
- The records name the commit that ran, not a clean tree; `verification.md` states the revision.
