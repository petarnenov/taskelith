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

- **Scope.** Only `check_reproducible` and `finish_reproducible` changed in `scripts/installation.sh`, plus five new helpers: `saved_manifest`, `config_digest`, `image_layers`, `report_layers`, and `compare_builds`. `build_image` and every other command are unchanged; the check passes `--no-cache` through its existing extra arguments. (Before the pass 1 fix `2f1e02bf` it also passed `--metadata-file`; see "Review".)
- **Errors.** A failed `docker image save` or `tar` fails the check with `the manifest.json of the saved image <image> cannot be read`; a saved manifest without exactly one `Config` entry fails it with `names <n> image configs, not one`, and an entry that is not `blobs/sha256/` and 64 hexadecimal digits with `names no image config blob`; a failed `docker image inspect` of the layers fails it with that status; none prints the pass line.
- **Compatibility.** The script runs under macOS `/bin/bash` 3.2 (the tests start `bash` from `/usr/bin:/bin`), so the layer comparison uses `read -r -a` and indexed loops, not `mapfile`.
- **Docs.** `docs/local-installation.md` describes the comparison and the containerd image ID; the requirement "Pinned image inputs" and the description of the image ID in the Dockerfile item stay, because they claim equal image IDs only on the classic store, where the image ID is the config digest.
- **Spec.** The modified requirement "Opt-in reproducibility check" has 499 characters, under the 500 of the pinned OpenSpec.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `chore` and `docs`, without attribution.

## Evidence check

- **Saved manifest.** On this host the `Config` entry of `docker image save <image> | tar -xOf - manifest.json`, read by the script's `config_digest`, equals the image ID for `busybox:latest` (`sha256:aaef90e06523...`), `alpine:3.20` (`sha256:bf8527eb54c3...`), and a scratch image (`FROM scratch`, one `COPY`) built with `docker build --no-cache`, `sha256:fd28bcfe4c0d841f3238c5cf8129ecf32447874d8f1fe8a5c08c5ad3e4ce4c16`; each manifest had one entry of the form `blobs/sha256/<hex>`. A missing image fails `config_digest` with `cannot be read`, status 1.
- **Containerd store.** Not measured: this host uses the classic store. The containerd path, an image ID that is the index digest while config and layers are equal, is covered only by the stub tests `the reproducibility check passes on one platform image in two indexes with their own attestations` and `... fails on a differing layer of two indexes with their own attestations`; the stub writes BuildKit's metadata of an index without a config digest.
- **Links.** The records link only inside the change directory or root-relative; `npm run verify:links` runs in `make verify`.

## Fail-before

The tests of `dbd1eb30` were run against the previous `scripts/installation.sh` (`git show a10ceaaf:scripts/installation.sh` in the working tree, restored afterwards) with `node --experimental-strip-types --test --test-name-pattern="reproducib|HEAD moves|removal" test/installation-script.test.ts` (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/ed004e12-a323-48a1-bf4e-0b555978c16b/scratchpad/fail-before.log`): 7 of 10 tests failed. The containerd test failed because the old check exited 1 with `two builds of one revision gave sha256:036dad823c49 and sha256:abc511323824`; the pass test and the five tests of differing parts, a missing config digest, and a failed layer read failed on the old messages and statuses. The `HEAD` move and the two removal tests passed in both runs. With the change, 10 of 10 pass.

## Checks

- `npm run openspec -- validate compare-worker-image-manifests --strict`: `Change 'compare-worker-image-manifests' is valid`.
- `make verify-worker-image-reproducible` on the clean tree of `9ddabc46`, classic image store: passed in 3 min 45 s with `installation.sh: both builds gave the worker image config sha256:5af9f0da19e0819158465af48d16a312ed856cd17fdc4bf9eaddcdcfceaf5f21`, and both images were removed (`docker images` lists no `-reproducible-` tag afterwards).
- `make verify` on the clean tree of `9ddabc46` passed on its first run, no rerun; the generated part below records it.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `cc501fa3c94768a7b74dc49495608189d1f2724f`; tests 3213, pass 3198, fail 0, skipped 15; all files 99.45% lines, 92.69% branches, 99.07% functions.
- `npm run openspec -- validate compare-worker-image-manifests --strict`: passed, `Change 'compare-worker-image-manifests' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 74 file(s); every pass summary file is valid: 54 file(s); every route file is valid: 10 file(s).`.
- Spec diff against the merge base `a10ceaaf860c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The containerd image store was not available on this host; its path is covered by the stub tests only, and that `docker image save` there writes one `manifest.json` entry, for the platform image, is not measured; another entry would fail the check, not pass it.
- `docker image save` streams each whole image through `tar` on every check.
- An engine before Docker 25 names the config `<hex>.json`, which fails the check with `names no image config blob`.

## Remaining gates

- Independent review passes assigned by the coordinator (pass 1 reviewer A, pass 2 reviewer B).
- Archive of the change after review.
- Integration into dev by the coordinator (single pull request)

## Review

Not yet run.
