# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki) for the change `compare-worker-image-manifests`, size S, commit type `chore`: make `make verify-worker-image-reproducible` compare the platform image of its two builds, its config digest and ordered layer digests, the same way on the classic and the containerd image store, without network access, and name what differs on a mismatch. Provenance attestations stay enabled (owner and architect decision). Out of scope: the rest of `scripts/installation.sh` and `make integrate` cleanup.

- **Base revision:** `a10ceaaf` (`origin/dev`, merge of pull request #397).
- **Implementation:** `dbd1eb30`: `check-reproducible` and its helpers in `scripts/installation.sh`, the tests in `test/installation-script.test.ts`, `docs/local-installation.md`, and this change's proposal, design, spec delta, tasks, and `checklist.json`. `9ddabc46` commits `route.json` unedited, from `make findings ARGS="route --change compare-worker-image-manifests"` after `dbd1eb30` and the record skeleton: tier `standard` (no trigger), rule version 1, recommending `codex gpt-6.1-sol#medium` for pass 1 and `claude claude-opus-5-5#high` for pass 2; the shadow router `jev-1.14.0` agreed (0.77).
- **Checklist:** saved with the brief's invocation, `--at a10ceaaf860c547708632721431954a5f5cbf3ef --size S`.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64 iMac), Node.js 24.22.1 from `.nvmrc`, Docker Engine 29.5.2 with buildx v0.34.0-desktop.1. `docker info` reports the storage driver `overlay2`, that is the classic image store, not the containerd store.

## Author self-check

- **Scope.** Only `check_reproducible` changed in `scripts/installation.sh`, plus five new helpers: `saved_manifest`, `config_digest`, `image_layers`, `report_layers`, and `compare_builds`. `build_image` and every other command are unchanged; the check passes `--no-cache` through its existing extra arguments. (Before the pass 1 fix `2f1e02bf` it also passed `--metadata-file`; see "Review".)
- **Errors.** A failed `docker image save` or `tar` fails the check with `the manifest.json of the saved image <image> cannot be read`; a saved manifest without exactly one `Config` entry fails it with `names <n> image configs, not one`, and an entry that is not `blobs/sha256/` and 64 hexadecimal digits with `names no image config blob`; a failed `docker image inspect` of the layers fails it with that status; none prints the pass line.
- **Compatibility.** The script runs under macOS `/bin/bash` 3.2 (the tests start `bash` from `/usr/bin:/bin`), so the layer comparison uses `read -r -a` and indexed loops, not `mapfile`.
- **Docs.** `docs/local-installation.md` describes the comparison and the containerd image ID; the requirement "Pinned image inputs" and the description of the image ID in the Dockerfile item stay, because they claim equal image IDs only on the classic store, where the image ID is the config digest.
- **Spec.** The modified requirement "Opt-in reproducibility check" has 497 characters after review pass 2, under the 500 of the pinned OpenSpec.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `chore` and `docs`, without attribution.

## Evidence check

- **Saved manifest.** On this host the `Config` entry of `docker image save <image> | tar -xOf - manifest.json`, read by the script's `config_digest`, equals the image ID for `busybox:latest` (`sha256:aaef90e06523...`), `alpine:3.20` (`sha256:bf8527eb54c3...`), and a scratch image (`FROM scratch`, one `COPY`) built with `docker build --no-cache`, `sha256:fd28bcfe4c0d841f3238c5cf8129ecf32447874d8f1fe8a5c08c5ad3e4ce4c16`; each manifest had one entry of the form `blobs/sha256/<hex>`. A missing image fails `config_digest` with `cannot be read`, status 1.
- **Containerd store.** Measured by the coordinator (Niki) on 2026-10-28 on the Linux host `geo-petarpetrov`, Docker Server 29.8.2, whose `docker info` reports the driver `overlayfs` with `DriverStatus` `[[driver-type io.containerd.snapshotter.v1]]`, that is the containerd image store; see "Checks" for the run. The second build exported an attestation manifest (`sha256:c6ec82a0...`) and a manifest list (`sha256:0cdcd5e1...`), so the image ID was an index digest with a provenance attestation, and the check passed on the config digest. The pass confirms both containerd facts the design assumed: the save wrote one `manifest.json` entry, for the platform image, since another entry fails the check, and `docker image inspect` reported layers that compared equal. The stub tests `the reproducibility check passes on one platform image in two indexes with their own attestations` and `... fails on a differing layer of two indexes with their own attestations` still cover the path in `make verify`; both give the two builds different image IDs; the passing test has the same saved config and layers, the failing one the same config and a differing first layer.
- **Links.** The records link only inside the change directory or root-relative; `npm run verify:links` runs in `make verify`.

## Fail-before

The tests of `dbd1eb30` were run against the previous `scripts/installation.sh` (`git show a10ceaaf:scripts/installation.sh` in the working tree, restored afterwards) with `node --experimental-strip-types --test --test-name-pattern="reproducib|HEAD moves|removal" test/installation-script.test.ts` (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/ed004e12-a323-48a1-bf4e-0b555978c16b/scratchpad/fail-before.log`): 7 of 10 tests failed. The containerd test failed because the old check exited 1 with `two builds of one revision gave sha256:036dad823c49 and sha256:abc511323824`; the pass test and the five tests of differing parts, a missing config digest, and a failed layer read failed on the old messages and statuses. The `HEAD` move and the two removal tests passed in both runs. With the change, 10 of 10 pass.

After review pass 1, the tests of `2f1e02bf` were run the same way against `scripts/installation.sh` of `8c9268ab`, the pass 1 code (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/ed004e12-a323-48a1-bf4e-0b555978c16b/scratchpad/fail-before-pass1.log`): 7 of 12 failed. The containerd test `the reproducibility check passes on one platform image in two indexes with their own attestations` failed with `the build metadata .../first.json names no image config digest`, the defect of finding H1; the other six failed on that message, the old `--metadata-file` argument, or the old missing save step. The `HEAD` move, the two removal tests, the missing layer, and the failed layer read passed in both runs. With the fix, 12 of 12 pass.

## Checks

- `npm run openspec -- validate compare-worker-image-manifests --strict`: `Change 'compare-worker-image-manifests' is valid`.
- `make verify-worker-image-reproducible` on the clean tree of `9ddabc46`, classic image store: passed in 3 min 45 s with `installation.sh: both builds gave the worker image config sha256:5af9f0da19e0819158465af48d16a312ed856cd17fdc4bf9eaddcdcfceaf5f21`, and both images were removed (`docker images` lists no `-reproducible-` tag afterwards).
- `make verify` on the clean tree of `9ddabc46` passed on its first run, no rerun.
- After the pass 1 fixes, `make verify-worker-image-reproducible` on the clean tree of `ec9d8e97`, classic image store: passed in 4 min 4 s with `installation.sh: both builds gave the worker image config sha256:be48a55bb977579d9ea493b4025d0bd3db652816f2f1cf9f9f369504be09f802`, read from the saved manifests, and both images were removed.
- `make verify` on the clean tree of `ec9d8e97` passed on its first run, no rerun.
- After the pass 2 fixes, `node --experimental-strip-types --test test/installation-script.test.ts`: 33 of 33 passed.
- `make verify-worker-image-reproducible` on the clean tree of `1b87a408`, classic image store: passed in 2 min 12 s with `installation.sh: both builds gave the worker image config sha256:bb76a72a5ad6e6f4a404f1de449ba29f778f6ad08a5e3c529a2a7537e9557bd0`, and both images were removed.
- `make verify` on the clean tree of `1b87a408` passed on its first run, no rerun; the generated part below records it.
- After review pass 3, the coordinator (Niki) ran `make verify-worker-image-reproducible` over SSH on the containerd-store host `geo-petarpetrov` (see "Evidence check"), on the branch at `52ffacf1` in a fresh shallow clone in a scratch directory, removed afterwards: exit 0, real 1 min 33.7 s, final line `installation.sh: both builds gave the worker image config sha256:427e0976090d9e0dbc825e729b6b70d402d16a10f106a38a9df2d38f8f3c5f8e`. No `-reproducible-` image was left (count 0). The build printed three BuildKit warnings `InvalidDefaultArgInFrom` for `ARG BASE` (Dockerfile lines 7, 15, and 25), which predate this change and are out of its scope. The two image IDs, which the gate asked for, were not recorded; the attestation manifest and manifest list of the second build show the index case. The later commits up to `d94ce351` change only records under `openspec/changes/compare-worker-image-manifests` (`git diff --stat 52ffacf1 d94ce351`: `findings.jsonl`, `passes.jsonl`, `verification.md`), so the run covers this change's code.
- `make verify` on the clean tree `7631944c` of the records of the containerd run, which change `design.md`, before this line and the generated part were written, passed on its first run, no rerun; the generated part below records it.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `7631944cf5cb7b2afc00dc5e99e90b3ce8b10ac4`; tests 3215, pass 3200, fail 0, skipped 15; all files 99.45% lines, 92.68% branches, 99.07% functions.
- `npm run openspec -- validate compare-worker-image-manifests --strict`: passed, `Change 'compare-worker-image-manifests' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 74 file(s); every pass summary file is valid: 54 file(s); every route file is valid: 10 file(s).`.
- Spec diff against the merge base `a10ceaaf860c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a1831a-5209-7d10-8002-cb76a2a8363d` | 0 | 1 | 1 | 0 |
| 2 | B | `claude claude-opus-5-5#high` | `93e7c704-8c25-41df-b55e-72892f3311bd` | 0 | 0 | 1 | 5 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a18341-1dc8-78a3-b3d9-9ac9b1c63283` | 0 | 0 | 0 | 1 |
<!-- make record: end -->

## Limitations

- The containerd image store was not available on the author's host; it was measured once, by the coordinator on `geo-petarpetrov` (Docker 29.8.2), with a passing run. The two image IDs of that run were not recorded, and no failing case was run on that store; the stub tests cover the failure paths.
- `docker image save` streams each whole image through `tar` on every check.
- An engine before Docker 25 names the config `<hex>.json`, which fails the check with `names no image config blob`.

## Remaining gates

- Archive of the change after review.
- Integration into dev by the coordinator (single pull request)

## Review pass 1

Reviewer A, Codex CLI `codex gpt-6.1-sol#medium`, session `01a1831a-5209-7d10-8002-cb76a2a8363d`; it reported model `gpt-6.1-sol`, effort `medium`, sandbox `read-only`, and the worktree snapshot `dcd109bf1a38e4ac6439391f90ea5068a77b9bf4a65e20c6875fdec350372b0c` before and after. Findings: 0 Critical, 1 High, 1 Medium, 0 Low, both fixed in `2f1e02bf`.

- **H1 (error-handling).** BuildKit names `containerimage.config.digest` in the metadata file only when it returns the image manifest; for an index with attestations, the containerd case, the key is missing and the check failed. The check now reads the config digest from the `Config` entry of the `manifest.json` of `docker image save`, on both stores and without network access; `--metadata-file` is gone, the layers still come from `RootFS.Layers`, and attestations stay enabled. A failed save or `tar`, no or several `Config` entries, or an entry that is not a `blobs/sha256/` digest fails the check with a message that names the image. Design decision 2 and the docs say so.
- **M1 (missing-fail-before-test).** The stub writes BuildKit's metadata without a config digest when the image ID is an index digest and serves a saved `manifest.json`; new tests cover two indexes with equal configs and layers, a differing layer under differing index digests, a failed save, and manifests with two, no, or a legacy config entry. The containerd test fails against the pass 1 code (see "Fail-before").

## Review pass 2

Reviewer B, Claude Code `claude claude-opus-5-5#high`, session `93e7c704-8c25-41df-b55e-72892f3311bd`; the model `claude-opus-5-5` is confirmed by `modelUsage` of the last result line, and the worktree snapshot was `5778c886f98036078b989d2a17256c68fb52afcc0f9771b2cd67cd129a043c86` before and after. Findings: 0 Critical, 0 High, 1 Medium, 5 Low, all fixed in `a6f958aa`. Review pass 3 by reviewer A is required, because the L1 and L2 fixes change code and tests.

- **M1 (evidence-mismatch).** Nothing has run on a containerd store, so design decision 3 and "Risks / Trade-offs" now mark both containerd facts as assumptions: one saved `manifest.json` entry, for the platform image, and `docker image inspect` reporting the platform image's `RootFS.Layers`. "Remaining gates" adds a run of `make verify-worker-image-reproducible` on a containerd-store engine; the coordinator's run after pass 3 met that gate (see "Evidence check").
- **L1 (docs).** The test stub no longer writes BuildKit metadata for `--metadata-file`, which the script stopped passing in `2f1e02bf`, nor reads a config variable; its comment says what it models. "Evidence check" says the containerd tests give the two builds different image IDs, with the same saved config and layers in the passing test and a differing first layer in the failing one. The fail-before record of `2f1e02bf` stays as history.
- **L2 (naming).** The build loop iterates over `"$first" "$second"` and builds each tag as is; `compare_builds` takes both tags as arguments instead of reading the caller's locals. `finish_reproducible` is unchanged.
- **L3 (evidence-mismatch).** "Author self-check" says only `check_reproducible` changed in `scripts/installation.sh`, plus the five new helpers.
- **L4 (spec-wording).** The scenario "Differing image index only" finishes its comparison, and the requirement says it names each differing layer index and, when they differ, both config digests. It has 497 characters; archiving the change in a scratch copy of the worktree and running `npm run openspec -- validate --all --strict` there passed, 71 of 71 items.
- **L5 (docs).** `docs/local-installation.md` lists a failed layer read among the failures of the check.

## Review pass 3

Reviewer A, Codex CLI `codex gpt-6.1-sol#medium`, session `01a18341-1dc8-78a3-b3d9-9ac9b1c63283`; it reported model `gpt-6.1-sol`, effort `medium`, sandbox `read-only`, and the worktree snapshot `619f32311573572b21f2e5c142d3d0337f0f61168997bbd3ad69d385c56b9d52` before and after. Findings: 0 Critical, 0 High, 0 Medium, 1 Low, fixed in `c3bb6aac` without another review, because the pass found only Low findings. The review ends with this pass.

- **L1 (evidence-mismatch).** "Evidence check" and the L1 entry of "Review pass 2" said both containerd stub tests have the same config and layers; the failing one has a differing first layer. Both places now say the passing test has the same config and layers and the failing one a differing first layer (fixed, unreviewed).
