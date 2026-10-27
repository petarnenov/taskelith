## Why

`run-g2-native-acceptance-linux-host` built the worker image twice from one commit and got two image digests (its verification, "Limitations"), so an image ID could not identify what a worker ran. The G2 closure (ADR 0015, `docs/decisions/0015-g2-closure.md:133`, decision 5, "Worker image not reproducible") left it as a non-blocking follow-up named `make-worker-image-reproducible`. The diagnosis (design) found that only timestamps differ: the image's dates, the file times that each build step writes, and the password-change day in `/etc/shadow`.

## What Changes

- **Spec.** The `local-installation` requirement "Pinned image inputs" requires that two builds of the worker image from one commit on one Docker engine, with or without the build cache, give the same image ID, and gains the scenario "Two builds of one commit". The added requirement "Opt-in reproducibility check" defines `make verify-worker-image-reproducible` and the static check of `make verify`.
- **Docs.** `docs/local-installation.md` describes the fixed dates and the new target.
- **Dockerfile.** Every stage of the worker image declares `SOURCE_DATE_EPOCH`, and each of its `RUN` steps clamps the file times it changes to it. Node.js is unpacked in its download stage and copied into the images, so the tarball no longer ships as a layer.
- **Scripts.** `scripts/installation.sh` passes the commit time of the built revision as `SOURCE_DATE_EPOCH` and gains the command `check-reproducible`; `scripts/harness-qualification.sh` passes it too, because the shared stages now require it.
- **Make.** The opt-in target `make verify-worker-image-reproducible`.
- **Tests.** Script tests of the epoch, the check's pass and failure, and the harness build; a Dockerfile test that every `RUN` of the worker image clamps its file times.

No new tool, dependency, base image, registry, or publishing step. No contract, schema, wire message, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-installation`: requirement "Pinned image inputs" modified; requirement "Opt-in reproducibility check" added.

## Impact

- `infra/installation/Dockerfile`, `scripts/installation.sh`, `scripts/harness-qualification.sh`, `Makefile`, `docs/local-installation.md`.
- `test/installation-script.test.ts`, `test/installation-composition.test.ts`.
- Out of scope: the `worker-harnesses` variant's own `harnesses` stage, which still writes unclamped times, and the control-plane image beyond what the shared stages give it (design, open questions).
