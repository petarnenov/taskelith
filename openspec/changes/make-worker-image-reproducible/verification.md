# Verification

Date: 2026-10-27. The author's verification is recorded below; the independent review passes are pending.

## Scope and source

The worker image was not reproducible: `run-g2-native-acceptance-linux-host` built it twice from one commit with different digests (its verification, "Limitations"), and the G2 closure (ADR 0015 on branch `close-g2`, decision 5) left it to this change. Coordinator Niki assigned the task; it was developed in a briefed subagent (`docs/agent-task-protocol.md`, "Subagent execution") in worktree `taskelith-worktrees/make-worker-image-reproducible` on branch `make-worker-image-reproducible`.

- **Base revision:** `21f399a5` (`origin/dev`, #344).
- **Revision verified:** `8b3aebef`: the spec delta and docs (`a7ecfb07`) and the implementation with its tests (`8b3aebef`).
- **Scope:** the `local-installation` delta, `docs/local-installation.md`, `infra/installation/Dockerfile`, `scripts/installation.sh`, `scripts/harness-qualification.sh`, the `Makefile` target, and their tests.
- **Out of scope:** the `harnesses` stage of the `worker-harnesses` variant, the control-plane image built twice, and other image stores and BuildKit versions (design, open questions).

## Environment

Linux 6.8.0-147-generic, x86_64; Docker Engine 27.3.1, classic image store, storage driver `overlay2`; buildx v0.17.1, BuildKit v0.16.0 (`default` builder, `docker` driver); Node.js v24.22.1 from `.nvmrc`.

## Author self-check

- The gate of the brief does not apply: no new tool or dependency, the same digest-pinned base, no registry or publishing step (design, "Gate decision").
- Every `RUN` of the worker image's stages (`node-amd64`, `node-arm64`, `build`, `runtime`, `worker`) declares `ARG SOURCE_DATE_EPOCH` and ends with the clamp; the test of decision 5 checks it.
- Both callers of the Dockerfile pass `SOURCE_DATE_EPOCH`: `scripts/installation.sh:47` and `scripts/harness-qualification.sh:56`; `Makefile` target `linux-test-image` builds `tools/linux-cgroup`, not this Dockerfile.
- The new image has the same files as the old one: a listing of path, mode, owner, size, and link target of the old build A and of build F, the new Dockerfile on the context of `21f399a5`, 15485 lines each, differs only in the size of `/opt/taskelith/infra/installation/Dockerfile`, which this change edits; the old image's tarball layer is gone (373465113 against 315175458 bytes).
- Two existing assertions follow the Dockerfile: the `taskelith-exec` line ends with a continuation (`test/installation-composition.test.ts:174`), and the `harnesses` stage starts `FROM node` (`test/harness-image-pins.test.ts:127`).
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs` and `chore`; no published package changes.

## Evidence check

- **Before, two builds of `21f399a5`.** A, with the arguments of `build_image` and the build cache: `sha256:d16ac5ba4eed08bdaf14eb082d72c19603f0e8ec25e3afe27358a99449d67527`. B, with `--no-cache`: `sha256:6f0e03d7dee93a4fe3143b4988cd532cc9be522deb431a46e45d635483a66f75`. 5 of 7 layers differ, only in times and the `/etc/shadow` day (design, "Diagnosis"). In B, BuildKit still took the checksum-pinned `ADD` from its cache, as it did in every later build recorded here.
- **Probes on `21f399a5`.** `SOURCE_DATE_EPOCH` alone, twice with `--no-cache`: `sha256:652394ca1b0790febd98d3375861ffad2f4aafec77181569b801eca7364d2265` and `sha256:27f8dc7709f5e6a12100bfa4d6cfaa1182466b34102813d98938ef95be24e719`. `rewrite-timestamp=true`: `sha256:9103a1f3adca591590ed9b80769d73573c37a06dfc133f93636e40427ed34e8c`, with the layers of B.
- **After, `make verify-worker-image-reproducible` at `8b3aebef`** (clean tree, commit time `1793106612`): exit 0, `installation.sh: both builds gave the worker image sha256:40742d1cdbf266a3d3208857d2da295dd7abfe7cc1179caf1f428d20ccfcc52a`. Both tagged images were removed. An earlier run at `bd3b4f39`, the same implementation before the fix of `test/harness-image-pins.test.ts:127` was amended into it, also passed, with `sha256:32058410fb77898fc73b3f7df95ac3ad48060850a3ff9d6e6bab979a22000f4a` in 3 min 43 s; the ID differs because the tree differs.
- **The check fails before the fix.** With the Dockerfile of `21f399a5` in the working tree and the new scripts, `make verify-worker-image-reproducible`: exit 2, `installation.sh: two builds of one revision gave sha256:a9e5f0db25ab4b524074032cb8af2d1ec31c953c1a18ecd13d24688ef25f3900 and sha256:8c6dd656275805a9cd53370f1ec83a1a320976d107c8f913da5df4e6863ea428`, `make: *** [Makefile:168: verify-worker-image-reproducible] Error 1`. The Dockerfile was restored with `git checkout`; both images were removed.
- **Script tests fail before the change.** With `scripts/installation.sh` and `scripts/harness-qualification.sh` of `21f399a5` and the new tests, `node --experimental-strip-types --test --test-reporter=spec test/installation-script.test.ts`: 11 tests, 7 pass, 4 fail, the four new tests (`test/installation-script.test.ts:211`, `:218`, `:226`, `:240`). After the change: 11 tests, 11 pass.
- **Dockerfile test fails before the change.** With the Dockerfile of `21f399a5`, after `npm run build`, `node --experimental-strip-types --test --test-reporter=spec test/installation-composition.test.ts`: 12 tests, 10 pass, 2 fail: the new `every RUN of the worker image clamps the mtimes it changes to SOURCE_DATE_EPOCH` (`test/installation-composition.test.ts:127`) and the adjusted execution-account test. After the change: 12 tests, 12 pass.
- **`useradd` honors the epoch.** In a container of the base, `SOURCE_DATE_EPOCH=1700000000 useradd` wrote day 19675; without it, day 20753, the build day. The prototype build F of the new Dockerfile on `21f399a5` (commit time `1793104207`) has day 20753, the commit day, for `taskelith` and `taskelith-exec`.

## Checks

- `npm run openspec -- validate make-worker-image-reproducible --strict`: valid.
- `make findings ARGS="checklist --capability local-installation,native-worker-acceptance,worker-platform-foundation --files Makefile,**/Dockerfile*,scripts/installation.sh,docker-compose*.yml,deploy/**"`: the categories in the design's "Review checklist".
- `make verify` at `8b3aebef`: exit 0; 2140 tests, 2093 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.20%, functions 98.92%; `validate --all --strict` 70 passed; every active change archives into strictly valid specs; package verification passed. A first run, before `test/harness-image-pins.test.ts:127` followed the new `harnesses` stage, failed on that test alone (2140 tests, 2092 pass, 1 fail); the fix was amended into `8b3aebef`.

## Independent review

Pending: the coordinator assigns the reviewers. `findings.jsonl` and `passes.jsonl` are empty.

## Limitations

- Measured on one engine only: the classic image store of Docker Engine 27.3.1 with BuildKit v0.16.0. With the containerd image store the image ID is a manifest digest that also covers compressed layers; that store and other BuildKit versions are not verified.
- Builds of one commit on different days were not run; the only day-dependent content found, the `/etc/shadow` day, now comes from the epoch.
- The `worker-harnesses` variant and the control-plane image are not claimed to be reproducible.

## Remaining gates

- Independent review passes assigned by the coordinator, recorded in `passes.jsonl` and `findings.jsonl`.
- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request)
