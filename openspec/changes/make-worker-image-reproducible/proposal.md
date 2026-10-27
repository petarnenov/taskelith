## Why

`run-g2-native-acceptance-linux-host` built the worker image twice from one commit and got two image digests (its verification, "Limitations"), so an image ID could not identify what a worker ran. The G2 closure (ADR 0015, `docs/decisions/0015-g2-closure.md:133`, decision 5, "Worker image not reproducible") left it as a non-blocking follow-up named `make-worker-image-reproducible`. The diagnosis (design) found that only timestamps differ: the image's dates, the file times that each build step writes, and the password-change day in `/etc/shadow`.

## What Changes

- **Spec.** The `local-installation` requirement "Pinned image inputs" requires that two builds of the worker image from one commit without the build cache, on one Docker engine with the classic image store, give the same image ID, and gains the scenario "Two builds of one commit". The added requirement "Opt-in reproducibility check" defines `make verify-worker-image-reproducible` and the static check of `make verify`.
- **Docs.** `docs/local-installation.md` describes the fixed dates, the limit to builds without the cache, and the new target.
- **Dockerfile.** Every stage the worker image is built or copies from declares `SOURCE_DATE_EPOCH` where it runs commands, and each of its `RUN` steps ends with a clamp of the file times it writes to it. Node.js is unpacked in its download stage and copied into the images, so the tarball no longer ships as a layer.
- **Scripts.** `scripts/installation.sh` resolves the built revision once to a commit ID (`HEAD` or the `git stash create` commit), reads its commit time once, passes it as `SOURCE_DATE_EPOCH`, and stops before any build when either step fails. It gains the command `check-reproducible`, which builds that one commit twice, reports a failed removal of its images, and keeps the status of a failed build. `scripts/harness-qualification.sh` reads the commit time once and passes it too, because the shared stages now require it.
- **Make.** The opt-in target `make verify-worker-image-reproducible`.
- **Tests.** Script tests of the epoch, of a failed stash and a failed commit-time read, of `HEAD` moving between the check's builds, of the check's pass and failure, of failed image removal, and of the harness build; Dockerfile tests that derive the stages of the worker image and require the clamp at the end of each of their `RUN` steps.

No new tool, dependency, base image, registry, or publishing step. No contract, schema, wire message, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-installation`: requirement "Pinned image inputs" modified; requirement "Opt-in reproducibility check" added.

## Impact

- `infra/installation/Dockerfile`, `scripts/installation.sh`, `scripts/harness-qualification.sh`, `Makefile`, `docs/local-installation.md`.
- At the coordinator's request, a bounded note on one line each of `docs/decisions/0015-g2-closure.md` (the deferral "Worker image not reproducible") and `docs/foundation.md` (the row "Worker image reproducibility"): resolved for builds without the cache, measured on the classic image store of Docker Engine 27.3.1; cached builds are not claimed.
- `test/installation-script.test.ts`, `test/installation-composition.test.ts`.
- Out of scope: the `worker-harnesses` variant's own `harnesses` stage, which still writes unclamped times, and the control-plane image beyond what the shared stages give it (design, open questions).
