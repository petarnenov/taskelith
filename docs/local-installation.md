# Minimal local installation

Status: G2 item 23, first part (`compose-minimal-local-installation-images`). The composition runs the control plane, PostgreSQL, NATS, and a Linux worker on one Docker host and enrolls workers. It does not yet execute tasks: the end-to-end path (submit, assign, execute) follows in item 23b, after the worker runtime (item 20) and execution reconciliation (item 21). No workflow is installed, so the control plane refuses every run until then.

## Parts

- [`infra/installation/compose.yaml`](../infra/installation/compose.yaml): PostgreSQL and NATS with the digest-pinned images of the integration services, the control plane, a one-shot administrative entry, and the Linux worker. Each service keeps its data on a named volume.
- [`infra/installation/Dockerfile`](../infra/installation/Dockerfile): the control-plane and worker images, built on the digest-pinned Ubuntu 24.04 base with Node.js from its checksummed release tarball for linux/amd64 or linux/arm64. Both run as the unprivileged `taskelith` user (uid 10001) with the data root `/var/lib/taskelith`, and contain no credentials or state: the build context is a `git archive` of the tracked files with their uncommitted edits, so untracked and ignored files never reach an image.
- [`scripts/installation.sh`](../scripts/installation.sh): the steps the `make` targets run.
- The `worker-harnesses` target of the same Dockerfile: a worker image variant with the pinned Claude Code and Codex packages, installed from [`infra/installation/harnesses/`](../infra/installation/harnesses/package-lock.json) by `npm ci --ignore-scripts` against the lockfile's integrity hashes, owned by root, with `DISABLE_AUTOUPDATER=1`. It exists for harness qualification; the composition runs the default `worker` image, which contains no harness. It is the last stage, so every build of this Dockerfile names its target, as the scripts do. Both harnesses stay `candidate` ([Claude Code](qualification/claude-code.md#linux-worker-image), [Codex](qualification/codex.md#linux-worker-image)).

The Compose project is named per worktree (`taskelith-<id>-installation`), like the integration services, and the images are tagged with the project name, so worktrees never replace each other's images.

## Operation

Every target except the build needs `TASKELITH_POSTGRES_PASSWORD` in the environment; it goes into a `postgres:` URL, so use URL-safe characters. Keep it, because the database volume keeps the first one.

1. `make installation-build` builds both images. A new file must be staged (`git add`) to be part of them.
2. `make installation-bootstrap ACTOR=<who> REASON=<why>` starts PostgreSQL, runs `init` of the administrative entry ([installation contract](contracts/installation-and-enrollment.md) section 2), and copies the generated `nats-authority.conf` into the broker's configuration volume. It prints the operator secret once; store it, because only its hash is kept. If the copy fails after `init` succeeded, `make installation-broker-config` repeats only the copy; a second bootstrap fails with `conflict`.
3. `make installation-start` starts PostgreSQL, NATS, and the control plane, and restarts an enrolled worker container. If the control plane does not become healthy, the target stops it, so that it does not restart in a loop, prints its last error, and fails.
4. `make installation-enroll`, with `TASKELITH_OPERATOR_TOKEN` set to the operator secret, issues a single-use enrollment token and starts the Linux worker container, which enrolls on its first start; the target fails unless the worker stores its identity within a minute.
5. `make installation-stop` stops the containers and keeps the volumes.

The control-plane API is on `http://127.0.0.1:8080` and NATS on `nats://127.0.0.1:4222`. `TASKELITH_API_PUBLISH_PORT` and `TASKELITH_NATS_PUBLISH_PORT` change the host ports.

`make` passes `ACTOR`, `REASON`, `PLATFORM`, `ARCHITECTURE`, and `WORKER_HOSTNAME` to the script through the environment, never as shell text; `make` itself still expands `$(...)` in them.

### A native macOS worker

`make installation-enrollment-token PLATFORM=darwin ARCHITECTURE=arm64`, with `TASKELITH_OPERATOR_TOKEN` set, prints a token; `WORKER_HOSTNAME` restricts it to one host name. Then, in a built checkout, run the worker with `TASKELITH_CONTROL_PLANE_URL=http://127.0.0.1:8080`, `TASKELITH_NATS_URL=nats://127.0.0.1:4222`, and the token in `TASKELITH_ENROLLMENT_TOKEN`: `node apps/worker/dist/main.js`. A launchd service is G6 work.

### Launch settings

A worker launches accepted assignments only when `TASKELITH_WORKER_COMMAND` names the program each launch runs, as a JSON array of the executable and its arguments, for example `["/usr/local/bin/scripted-process","--exit","0"]`. In G2 this is a test-only scripted process; the harness invocation comes with G3. Without it the worker accepts assignments and launches none.

On Linux a launch also needs `TASKELITH_CONTAINMENT_PARENT`, the absolute path of the delegated cgroup that holds each execution's containment, and `TASKELITH_EXECUTION_UID` and `TASKELITH_EXECUTION_GID`, the account the child runs as, which owns no cgroup of the worker. A missing or invalid value fails the worker's start and names the variable.

## Checks

- `make verify` validates the resolved composition and the Dockerfile: digest pins, checksummed Node.js tarballs, unprivileged services, named data volumes, localhost-only ports, secrets from the environment, and stream reservations that fit the broker's fixed file store.
- `make qualify-harnesses OUT=<dir>` (opt-in, outside `make verify`) builds the `worker-harnesses` variant for each platform in `PLATFORMS` (default `linux/amd64 linux/arm64`) from the pinned inputs, and runs the credential-free harness steps in it with `--network none`, writing the step results, the before-and-after listings, the changed paths, a root search for credential files, and the image metadata per architecture to `OUT`, which must be outside the worktree; each run replaces the directory of every platform it runs, such as `OUT/amd64`. A platform whose build or steps fail gets an `error.txt`, the other platforms still run, and the target then fails. `make verify` checks the variant's pins without building it.
- `make verify-installation` (opt-in, outside `make verify`) builds the images, bootstraps, starts, and enrolls the Linux worker on a throwaway project with a random database password and ephemeral ports, restarts the composition, and removes it with its volumes and images. It also checks that the images run as `taskelith`, ship an empty data root, and do not contain an untracked file it creates for the build. When it fails, it prints the control plane's log before it removes the project.

## Broker storage

JetStream reserves the byte limit of each stream on the broker's disk when the stream is created. The installation fixes the broker's file store at 8 GiB (`max_file_store` in [`nats-server.conf`](../infra/installation/nats-server.conf)) and sets `TASKELITH_STREAM_MAX_BYTES` of the control plane to 1 GiB, so its five streams reserve 5 GiB. These are provisional local values ([operational targets](operational-targets.md) section 2). The `nats-data` volume needs 8 GiB of free disk; under Docker Desktop that is free space in its virtual machine's disk. With less, the control plane fails to start, and its error names the bytes the streams reserve.

## Limits

- Connections are plain: the control-plane API is HTTP, and NATS and PostgreSQL use no TLS. Ports are published on localhost only. TLS and the installation CA are G3 work.
- The enrollment token stays in the worker container's configuration. It is single-use and expires after 15 minutes.
- The images are built locally; publishing them to a registry is not part of this item.
