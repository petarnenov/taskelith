# Minimal local installation

Status: G2 item 23, first part (`compose-minimal-local-installation-images`). The composition runs the control plane, PostgreSQL, NATS, and a Linux worker on one Docker host and enrolls workers. It does not yet execute tasks: the end-to-end path (submit, assign, execute) follows in item 23b, after the worker runtime (item 20) and execution reconciliation (item 21). No workflow is installed, so the control plane refuses every run until then.

## Parts

- [`infra/installation/compose.yaml`](../infra/installation/compose.yaml): PostgreSQL and NATS with the digest-pinned images of the integration services, the control plane, a one-shot administrative entry, and the Linux worker. Each service keeps its data on a named volume.
- [`infra/installation/Dockerfile`](../infra/installation/Dockerfile): the control-plane and worker images, built on the digest-pinned Ubuntu 24.04 base with Node.js from its checksummed release tarball for linux/amd64 or linux/arm64. Both run as the unprivileged `taskelith` user (uid 10001) with the data root `/var/lib/taskelith`, and contain no credentials or state.
- [`scripts/installation.sh`](../scripts/installation.sh): the steps the `make` targets run.

The Compose project is named per worktree (`taskelith-<id>-installation`), like the integration services.

## Operation

Every target needs `TASKELITH_POSTGRES_PASSWORD` in the environment; it goes into a `postgres:` URL, so use URL-safe characters. Keep it, because the database volume keeps the first one.

1. `make installation-build` builds both images.
2. `make installation-bootstrap ACTOR=<who> REASON=<why>` starts PostgreSQL, runs `init` of the administrative entry ([installation contract](contracts/installation-and-enrollment.md) section 2), and copies the generated `nats-authority.conf` into the broker's configuration volume. It prints the operator secret once; store it, because only its hash is kept.
3. `make installation-start` starts PostgreSQL, NATS, and the control plane, and restarts an enrolled worker container.
4. `make installation-enroll`, with `TASKELITH_OPERATOR_TOKEN` set to the operator secret, issues a single-use enrollment token and starts the Linux worker container, which enrolls on its first start.
5. `make installation-stop` stops the containers and keeps the volumes.

The control-plane API is on `http://127.0.0.1:8080` and NATS on `nats://127.0.0.1:4222`. `TASKELITH_API_PUBLISH_PORT` and `TASKELITH_NATS_PUBLISH_PORT` change the host ports.

### A native macOS worker

`make installation-enrollment-token PLATFORM=darwin ARCHITECTURE=arm64`, with `TASKELITH_OPERATOR_TOKEN` set, prints a token; `WORKER_HOSTNAME` restricts it to one host name. Then, in a built checkout, run the worker with `TASKELITH_CONTROL_PLANE_URL=http://127.0.0.1:8080`, `TASKELITH_NATS_URL=nats://127.0.0.1:4222`, and the token in `TASKELITH_ENROLLMENT_TOKEN`: `node apps/worker/dist/main.js`. A launchd service is G6 work.

## Checks

- `make verify` validates the resolved composition and the Dockerfile: digest pins, checksummed Node.js tarballs, unprivileged services, named data volumes, localhost-only ports, and secrets from the environment.
- `make verify-installation` (opt-in, outside `make verify`) builds the images, bootstraps, starts, and enrolls the Linux worker on a throwaway project with a random database password and ephemeral ports, restarts the composition, and removes it with its volumes.

## Limits

- Connections are plain: the control-plane API is HTTP, and NATS and PostgreSQL use no TLS. Ports are published on localhost only. TLS and the installation CA are G3 work.
- The enrollment token stays in the worker container's configuration. It is single-use and expires after 15 minutes.
- The images are built locally; publishing them to a registry is not part of this item.
