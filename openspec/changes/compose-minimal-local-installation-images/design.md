## Context

The control plane, its administrative entry, and the worker start from environment settings and keep their state under a data root ([installation contract](../../../docs/contracts/installation-and-enrollment.md) sections 3, 4, and 10). `init` migrates the database and writes the broker authority, including `nats-authority.conf`, under `control-plane/`; the control plane needs an initialized installation and a running broker that loaded that file; a worker enrolls on its first start with a token. The worker refuses a data root on overlayfs or tmpfs, and both refuse a root that group or others can write.

## Goals / Non-Goals

**Goals:** build both images reproducibly from digest-pinned inputs; run the services unprivileged with their data on named volumes; order the bootstrap through `make`; keep `make verify` cheap.

**Non-Goals:** task execution end to end (23b); TLS for the API, NATS, or PostgreSQL (G3); a registry for the images; a launchd service for the macOS worker (G6); harnesses in the worker image (item 26).

## Decisions

1. **One Dockerfile, two targets.** A build stage runs `npm ci --ignore-scripts`, `npm run build`, and `npm prune --omit=dev` on the tracked sources; the `control-plane` and `worker` targets share the runtime stage and differ in their command. Both images carry the whole built workspace; per-application trimming is left until size matters.
2. **Node.js from the release tarball.** As in the item 15 test image, `ADD --checksum` fetches `node-v<pin>-linux-<arch>.tar.gz` and fails on a mismatch. A stage per architecture, selected by `TARGETARCH`, keeps both checksums literal. The linux-arm64 checksum comes from the release's `SHASUMS256.txt`, which also lists the pinned linux-x64 one.
3. **Pins in the Makefile.** The Ubuntu base and the checksums stay single definitions in the Makefile and reach Compose as required variables. The PostgreSQL and NATS images are repeated from the integration services, and a test keeps them equal.
4. **Unprivileged services.** The images run as `taskelith` (uid 10001) and create `/var/lib/taskelith` at mode `0700`, which Docker copies into an empty named volume, so the data root meets the ownership checks. NATS runs as uid 10002. A one-shot `nats-setup` container, the only root step, copies `nats-authority.conf` from the control-plane volume into a broker volume and hands the broker volumes to uid 10002, so the broker never mounts the control plane's seeds. PostgreSQL keeps its image's privilege drop.
5. **Bootstrap order.** `installation-bootstrap` starts PostgreSQL, runs `init` in a one-shot container of the control-plane image, then runs `nats-setup`. `installation-start` then starts NATS and the control plane, which waits for both healthchecks. The control plane's healthcheck accepts a TCP connection, because the API has no health endpoint.
6. **Secrets.** The database password comes from `TASKELITH_POSTGRES_PASSWORD`, the operator secret from `TASKELITH_OPERATOR_TOKEN` passed by name to the one-shot container, and the enrollment token through Compose's environment to the worker's first start. `init` prints the operator secret once to the caller.
7. **Ports.** Only the API (8080) and NATS (4222) are published, on `127.0.0.1`, so a native macOS worker can connect; the publish ports are variables, and the opt-in check sets them empty for ephemeral ports.
8. **Checks.** `make verify` resolves the composition with `docker compose config` and checks pins, users, volumes, ports, and secrets; Docker is already required there. Building and starting stay in `make verify-installation`.

## Risks / Trade-offs

- Plain connections on localhost only, until G3 brings TLS.
- The enrollment token remains in the worker container's configuration after use; it is single-use and short-lived.
- The image build needs network access for npm and the Node.js tarball.
