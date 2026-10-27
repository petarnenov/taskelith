## Why

G2 work item 23 ([docs/g2-plan.md](/docs/g2-plan.md)) packages the minimal local installation that decision D5 (a) selected: Docker Compose with PostgreSQL, NATS, a control-plane image, and a Linux worker image, run by `make` targets, with a macOS worker as a native process. Items 12, 13, and 16 left obligations to it: the `make` targets that run the administrative entry, the deployment of `nats-authority.conf`, and the images that run `apps/control-plane/src/main.ts` and `apps/worker/src/main.ts`.

Item 23 depends on items 13, 16, 20, and 21. Items 13 and 16 are merged; of items 20 and 21 only 20a (worker bootstrap) and 21a (placement) are. The coordinator split item 23 so that the packaging starts now:

- **23a (this change):** the images, the composition, and the `make` targets, with the two entries as they are today.
- **23b, after items 20 and 21:** the end-to-end smoke (submit, assign, execute) and anything the later runtime needs.

## What Changes

- **Images.** From a `git archive` of the tracked files, `infra/installation/Dockerfile` builds the control-plane and Linux worker images on the digest-pinned Ubuntu 24.04 base, with Node.js from its checksummed release tarball for linux/amd64 and linux/arm64. Both run unprivileged, with the data root on a named volume, and contain no credentials or state.
- **Composition.** `infra/installation/compose.yaml`: PostgreSQL and NATS with the integration services' pinned images and named volumes, the control plane, a one-shot administrative entry, a one-shot step that installs `nats-authority.conf` for the broker, and the worker.
- **Operation.** `make installation-build`, `installation-bootstrap`, `installation-broker-config`, `installation-start`, `installation-stop`, `installation-enroll`, and `installation-enrollment-token` (for a native macOS worker), through `scripts/installation.sh`. The Makefile pins the linux-arm64 Node.js tarball next to the linux-x64 one and names the Ubuntu base once for both images.
- **Checks.** A test in `make verify` validates the resolved composition and the Dockerfile. The opt-in `make verify-installation` builds, bootstraps, starts, enrolls, and restarts a throwaway installation.
- **Documents.** `docs/local-installation.md`, and the dependency record of the Ubuntu base and Node.js tarballs.

## Capabilities

### New Capabilities

- `local-installation`: the packaged minimal local installation, its images, composition, and `make` operation.

## Impact

Build and documentation files, a test, and a script; no product code, published CLI command, OpenAPI or AsyncAPI document, or npm dependency changes. The commits use `build`, `test`, and `docs`.
