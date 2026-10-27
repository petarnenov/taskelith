# Verification

Date: 2026-10-27. The author's verification, the merge of `dev`, and review passes 1 to 3 with their fixes are recorded below; the review has ended.

## Scope and source

The worker image was not reproducible: `run-g2-native-acceptance-linux-host` built it twice from one commit with different digests (its verification, "Limitations"), and the G2 closure (ADR 0015, `docs/decisions/0015-g2-closure.md:133`, decision 5) left it to this change. Coordinator Niki assigned the task; it was developed in a briefed subagent (`docs/agent-task-protocol.md`, "Subagent execution") in worktree `taskelith-worktrees/make-worker-image-reproducible` on branch `make-worker-image-reproducible`.

- **Base revision:** `21f399a5` (`origin/dev`, #344).
- **Revision verified:** `8b3aebef`: the spec delta and docs (`a7ecfb07`) and the implementation with its tests (`8b3aebef`); then `a8c1d6e2`, the fixes of review pass 1 on the merge of `dev` (`a2b6b5e5`); then `5dc42b19`, the fixes of review pass 2 (`68a6b3c5` docs and spec, `5dc42b19` scripts, Dockerfile comment, and tests), and the commit of this record with the ADR and ledger notes.
- **Merge of `dev`:** coordinator Niki merged `origin/dev` at `56346d92` (#348) into the branch as `a2b6b5e5`, without conflicts. It brought the record link rule of #346 (`npm run verify:links`), the `close-g2` change with `docs/decisions/0015-g2-closure.md`, and edits of `Makefile` and `docs/local-installation.md` outside this change's lines; it changed none of this change's scripts, Dockerfile, tests, or living spec. `make verify` passed on `a2b6b5e5` (coordinator's run).
- **Scope:** the `local-installation` delta, `docs/local-installation.md`, `infra/installation/Dockerfile`, `scripts/installation.sh`, `scripts/harness-qualification.sh`, the `Makefile` target, and their tests; at the coordinator's request, a bounded note on one line each of `docs/decisions/0015-g2-closure.md` (line 133, the deferral "Worker image not reproducible") and `docs/foundation.md` (line 88, the row "Worker image reproducibility"), which says the follow-up is resolved for builds without the cache, measured on the classic image store of Docker Engine 27.3.1, and does not claim cached builds.
- **Out of scope:** the `harnesses` stage of the `worker-harnesses` variant, the control-plane image built twice, and other image stores and BuildKit versions (design, open questions).

## Environment

Linux 6.8.0-147-generic, x86_64; Docker Engine 27.3.1, classic image store, storage driver `overlay2`; buildx v0.17.1, BuildKit v0.16.0 (`default` builder, `docker` driver); Node.js v24.22.1 from `.nvmrc`.

## Author self-check

- The gate of the brief does not apply: no new tool or dependency, the same digest-pinned base, no registry or publishing step (design, "Gate decision").
- Every `RUN` of the stages the worker image is built or copies from (`node-amd64`, `node-arm64`, `build`, `runtime`, `worker`; `node-files` and `node` have none) declares `ARG SOURCE_DATE_EPOCH` and ends with the clamp; the test of decision 5 derives that chain and checks it.
- Both callers of the Dockerfile pass `SOURCE_DATE_EPOCH`, read once by the caller: `scripts/installation.sh:47` (read at `:80` and `:108`) and `scripts/harness-qualification.sh:56` (read at `:130`); `Makefile` target `linux-test-image` builds `tools/linux-cgroup`, not this Dockerfile.
- The new image has the same files as the old one. At `5dc42b19` (review pass 2, finding L8), the worker image built from a `git archive` of that commit with its Dockerfile (`sha256:0296d507fefd190973179bfe6d66a4e99598a992fd7da6d23296a0d5519cd05b`, the ID of the check below) and from the same context with the Dockerfile of `21f399a5` (`sha256:87b6ef47cf396d5a05d3620c294ebbc0943f474c247814c8dadba919a37ce36a`): a listing of path, mode, owner, size, and link target, 15551 lines each, differs only in the size of `/opt/taskelith/infra/installation/Dockerfile`: 3497 bytes in the new image (this change's Dockerfile) and 2458 bytes in the old one (the Dockerfile of `21f399a5`). The new image is 315635233 bytes and the old one 373924894 bytes; the new one has no tarball layer. The first comparison, of builds A and F on `21f399a5` (15485 lines each), had the same result.
- Two existing assertions follow the Dockerfile: the `taskelith-exec` line ends with a continuation (`test/installation-composition.test.ts:204`), and the `harnesses` stage starts `FROM node` (`test/harness-image-pins.test.ts:127`).
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs` and `chore`; no published package changes.

## Evidence check

- **Before, two builds of `21f399a5`.** A, with the arguments of `build_image` and the build cache: `sha256:d16ac5ba4eed08bdaf14eb082d72c19603f0e8ec25e3afe27358a99449d67527`. B, with `--no-cache`: `sha256:6f0e03d7dee93a4fe3143b4988cd532cc9be522deb431a46e45d635483a66f75`. 5 of 7 layers differ, only in times and the `/etc/shadow` day (design, "Diagnosis"). In B, BuildKit still took the checksum-pinned `ADD` from its cache, as it did in every later build recorded here.
- **Probes on `21f399a5`.** `SOURCE_DATE_EPOCH` alone, twice with `--no-cache`: `sha256:652394ca1b0790febd98d3375861ffad2f4aafec77181569b801eca7364d2265` and `sha256:27f8dc7709f5e6a12100bfa4d6cfaa1182466b34102813d98938ef95be24e719`. `rewrite-timestamp=true`: `sha256:9103a1f3adca591590ed9b80769d73573c37a06dfc133f93636e40427ed34e8c`, with the layers of B.
- **After, `make verify-worker-image-reproducible` at `8b3aebef`** (clean tree, commit time `1793106612`): exit 0, `installation.sh: both builds gave the worker image sha256:40742d1cdbf266a3d3208857d2da295dd7abfe7cc1179caf1f428d20ccfcc52a`. Both tagged images were removed. An earlier run at `bd3b4f39`, the same implementation before the fix of `test/harness-image-pins.test.ts:127` was amended into it, also passed, with `sha256:32058410fb77898fc73b3f7df95ac3ad48060850a3ff9d6e6bab979a22000f4a` in 3 min 43 s; the ID differs because the tree differs.
- **The check fails before the fix.** With the Dockerfile of `21f399a5` in the working tree and the new scripts, `make verify-worker-image-reproducible`: exit 2, `installation.sh: two builds of one revision gave sha256:a9e5f0db25ab4b524074032cb8af2d1ec31c953c1a18ecd13d24688ef25f3900 and sha256:8c6dd656275805a9cd53370f1ec83a1a320976d107c8f913da5df4e6863ea428`, `make: *** [Makefile:168: verify-worker-image-reproducible] Error 1` (the recipe line at `8b3aebef`; `Makefile:170` since the merge). The Dockerfile was restored with `git checkout`; both images were removed.
- **Script tests fail before the change.** With `scripts/installation.sh` and `scripts/harness-qualification.sh` of `21f399a5` and the new tests, `node --experimental-strip-types --test --test-reporter=spec test/installation-script.test.ts`: 11 tests, 7 pass, 4 fail, the four new tests (at `8b3aebef`, `test/installation-script.test.ts:211`, `:218`, `:226`, `:240`). After the change: 11 tests, 11 pass.
- **Dockerfile test fails before the change.** With the Dockerfile of `21f399a5`, after `npm run build`, `node --experimental-strip-types --test --test-reporter=spec test/installation-composition.test.ts`: 12 tests, 10 pass, 2 fail: the new `every RUN of the worker image clamps the mtimes it changes to SOURCE_DATE_EPOCH` (at `8b3aebef`, `test/installation-composition.test.ts:127`) and the adjusted execution-account test. After the change: 12 tests, 12 pass.
- **`useradd` honors the epoch.** In a container of the base, `SOURCE_DATE_EPOCH=1700000000 useradd` wrote day 19675; without it, day 20753, the build day. The prototype build F of the new Dockerfile on `21f399a5` (commit time `1793104207`) has day 20753, the commit day, for `taskelith` and `taskelith-exec`.

- **Pass 1 fixes fail before.** With the four new tests and `scripts/installation.sh` of `a2b6b5e5`, `node --experimental-strip-types --test --test-reporter=spec test/installation-script.test.ts`: 15 tests, 11 pass, 4 fail, each on its defect: a `git stash create` failing with status 23 still started a build; with `HEAD` moved during the first build, the second build got `SOURCE_DATE_EPOCH=1800000000`; a failed removal left status 0; and no removal failure was reported. After `a8c1d6e2`: 15 tests, 15 pass (`test/installation-script.test.ts:263`, `:271`, `:279`, `:285`).
- **After the pass 1 fixes, `make verify-worker-image-reproducible` at `a8c1d6e2`** (clean tree, commit time `1793108348`): exit 0, `installation.sh: both builds gave the worker image sha256:7d233873fce4e67c1412d9fd080f044d1af92bc832e9a9c2321f577b2fc1898f`; both images were removed. The ID differs from the one at `8b3aebef` because the tree and the commit time differ.

- **After the pass 2 fixes, `make verify-worker-image-reproducible` at `5dc42b19`** (clean tree, commit time `1793109768`): exit 0, `installation.sh: both builds gave the worker image sha256:0296d507fefd190973179bfe6d66a4e99598a992fd7da6d23296a0d5519cd05b`; both images were removed. A later build of that commit with the cache, for the comparison of finding L8, gave the same ID.

## Checks

- `npm run openspec -- validate make-worker-image-reproducible --strict`: valid.
- `make findings ARGS="checklist --capability local-installation,native-worker-acceptance,worker-platform-foundation --files Makefile,**/Dockerfile*,scripts/installation.sh,docker-compose*.yml,deploy/**"`: the categories in the design's "Review checklist".
- `make verify` at `8b3aebef`: exit 0; 2140 tests, 2093 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.20%, functions 98.92%; `validate --all --strict` 70 passed; every active change archives into strictly valid specs; package verification passed. A first run, before `test/harness-image-pins.test.ts:127` followed the new `harnesses` stage, failed on that test alone (2140 tests, 2092 pass, 1 fail); the fix was amended into `8b3aebef`.
- `make verify` at `a8c1d6e2`, after the merge of `dev` and the pass 1 fixes: exit 0; 2177 tests, 2130 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.17%, functions 98.92%; `validate --all --strict` 70 passed; `verify:links`: every checked link conforms, 332 archived links in the baseline; package verification passed.
- `make findings ARGS="validate"` with the pass 1 records: valid.
- `make verify` at `5dc42b19`: exit 0; 2179 tests, 2132 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.18%, functions 98.92%; `validate --all --strict` 70 passed; `verify:links`: every checked link conforms, 332 archived links in the baseline; package verification passed.
- `make verify` at `7f43fdea`, the pass 2 record: a first run failed one test outside this change, `e. a crash between W1 and the ack of a cancellation is applied once after redelivery` (`test/g2-cancellation-races.test.ts:217`, exit `code 0` where `SIGTERM` was expected; 2179 tests, 2131 pass, 1 fail); the rerun passed: exit 0, 2179 tests, 2132 pass, 0 fail, 47 skipped, coverage lines 99.24%, branches 92.19%, functions 98.92%. This change touches no code that the scenario runs.

## Independent review

### Pass 1 (reviewer A)

- **Reviewer:** Codex, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, assigned and run by coordinator Niki.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- **Revision:** `a2b6b5e5`, reviewing `21f399a5..085506c9`.
- **Model confirmation:** the session header names model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`; session `01a17d91-4a33-7ff1-9ba4-92bf7fada3b5`.
- **Snapshot:** the same before and after the pass.
- **Limit:** the reviewer could not confirm the Docker digests, because the sandbox denies the Docker socket.
- **Findings:** 0 Critical, 0 High, 2 Medium, 1 Low, all on `local-installation`, all **fixed** in `a8c1d6e2`, pending pass 2:
  1. **M1 (error-handling), `scripts/installation.sh:61`:** `source_revision` ran in a command substitution, so a failed `git stash create` fell through to `HEAD` with status 0, and a build could drop uncommitted edits. Fixed: the assignment returns on failure, and both callers exit; the test `a failed stash of the uncommitted edits stops the build before any image is built` covers `build` and `check-reproducible`.
  2. **M2 (contract-drift), `scripts/installation.sh:62`:** on a clean tree it returned the ref `HEAD`, which every unpack and epoch read resolved again, so a commit between the check's builds compared two revisions. Fixed: it resolves the commit ID once with `git rev-parse --verify HEAD`; the test `the reproducibility check builds one commit when HEAD moves between its builds` commits during the first build.
  3. **L1 (error-handling), `scripts/installation.sh:86`:** the cleanup trap hid a failed `docker image rm`. Fixed: `finish_reproducible` removes the images that exist, reports a failed removal, fails a check that passed, and keeps the status of a failed build; two tests cover both cases.

### Pass 2 (reviewer B)

- **Reviewer:** Claude Code, model `claude-opus-5-5`, effort `high`, read-only (plan mode, editing tools disallowed), assigned and run by coordinator Niki.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- **Revision:** `89b42d55`.
- **Model confirmation:** `modelUsage` of the JSON result records only `claude-opus-5-5`; session `e447925b-d93f-451d-ab2b-b304b14fceec`.
- **Snapshot:** the same before and after the pass.
- **Confirmed:** the three pass 1 fixes, and that the merge of `dev` does not invalidate the change.
- **Findings:** 0 Critical, 0 High, 1 Medium, 8 Low, all **fixed** in `68a6b3c5`, `5dc42b19`, and this record, pending pass 3; `local-installation` unless a record finding:
  1. **M1 (contract-drift), delta line 4 and `docs/local-installation.md:8`:** both claimed one ID with or without the build cache, but a cached `COPY` layer of an earlier commit keeps its older times. Fixed in `68a6b3c5`: the requirement, its scenario, the doc, and design decision 7 cover builds without the cache; cached builds are a limitation, inferred and not run.
  2. **L1 (spec-wording), delta line 4:** "on one Docker engine" promised more than the measured classic image store. Fixed in `68a6b3c5`: the requirement and scenario name the classic image store.
  3. **L2 (missing-fail-before-test), `test/installation-composition.test.ts:128`:** the stage list was fixed, so a new unclamped stage in the worker's chain passed. Fixed in `5dc42b19`: `stageChain` follows `FROM` and `COPY --from` from `worker` (`test/installation-composition.test.ts:148`, `:156`). With a stage `extra` with an unclamped `RUN` copied into `runtime`, the old test passed (12 of 12) and the new one fails (13 tests, 12 pass, 1 fail); the stage was removed again.
  4. **L3 (spec-wording), delta line 17 and `docs/local-installation.md:8` and `:91`:** they said the check verifies the clamp of the changed times; it checks the suffix. Fixed in `68a6b3c5`: "ends with the clamp to `SOURCE_DATE_EPOCH`".
  5. **L4 (docs), `infra/installation/Dockerfile:5`:** the comment said each `RUN` clamps, but `harnesses` does not. Fixed in `5dc42b19`: it names the worker image's stages.
  6. **L5 (error-handling), `scripts/installation.sh:47` and `scripts/harness-qualification.sh:56`:** the commit time was read inside the build arguments, so a failed `git log` was not caught, and the check read it twice. Fixed in `5dc42b19`: each caller reads it once with `|| exit` and passes it. The test `a failed read of the commit time stops every build before any image is built` (`test/installation-script.test.ts:293`) fails on `89b42d55`'s scripts (16 tests, 15 pass, 1 fail; a build started) and passes after (16 of 16).
  7. **L6 (evidence-mismatch), `scripts/harness-qualification.sh`:** the harness build had not run with Docker after the change. Fixed: `make qualify-harnesses PLATFORMS=linux/amd64 OUT=<scratch>` on the clean tree of `5dc42b19`: exit 0 in 1 min 47 s, `linux/amd64 done`; `image.txt` names tree `5dc42b19bcfd322dce439f59a8e1946c83a67495`, engine 27.3.1, image `sha256:47a816c7bc2f49f169f7f67788dc74a9167ba1fbea2ee6d189a641327987e995`; `credential-files.txt` is empty.
  8. **L7 (docs, record), `proposal.md:10` and `:12`:** "Scripts" and "Tests" missed the pass 1 changes. Fixed in `68a6b3c5`.
  9. **L8 (evidence-mismatch, record), `verification.md:24`:** the file comparison came from prototype F on `21f399a5`. Fixed in this record: repeated at `5dc42b19` (author self-check); its sizes were corrected after pass 3, so it is **fixed, unreviewed**.

### Pass 3 (reviewer A)

- **Reviewer:** Codex, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, assigned and run by coordinator Niki, with the invocation of pass 1.
- **Revision:** `78afaef7`.
- **Model confirmation:** the session header names model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`; session `01a17dc0-1fd5-78d2-8c69-7e82b07a2ca5`.
- **Snapshot:** the same before and after the pass.
- **Limit:** as in pass 1, the sandbox denied the Docker socket, so the reviewer could not confirm the Docker digests.
- **Pass 2 status:** M1 and L1 to L7 resolved; L8 partly resolved, because the sizes of the repeated comparison were given in the wrong order. The bounded notes at `docs/decisions/0015-g2-closure.md:133` and `docs/foundation.md:88` touch only those lines and state exactly the proven scope.
- **Findings:** 0 Critical, 0 High, 0 Medium, 1 Low:
  1. **L1 (evidence-mismatch, record), `verification.md:24`:** the sentence named the new image first, but its sizes "2458 against 3497" were in the old image's order. **Fixed, unreviewed:** the author self-check gives each Dockerfile size and image size with its image. This fix also finishes pass 2 finding L8, which is therefore `fixed-unreviewed` as well.
- The pass was the third and Low-only, so its fix takes no further pass (`docs/governance.md`, "Independent review process"); the review has ended.

## Limitations

- Builds with the cache are not claimed: a cached `COPY` layer of an earlier commit with the same content keeps its older file times (design, decision 7); inferred from BuildKit's cache key, not run.
- Measured on one engine only: the classic image store of Docker Engine 27.3.1 with BuildKit v0.16.0. With the containerd image store the image ID is a manifest digest that also covers compressed layers; that store and other BuildKit versions are not verified.
- Builds of one commit on different days were not run; the only day-dependent content found, the `/etc/shadow` day, now comes from the epoch.
- The `worker-harnesses` variant and the control-plane image are not claimed to be reproducible.

## Remaining gates

- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request)
