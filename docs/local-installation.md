# Minimal local installation

Status: G2 item 23, parts 23a (`compose-minimal-local-installation-images`) and 23b (`compose-installation-end-to-end`). The composition runs the control plane, PostgreSQL, NATS, and a Linux worker on one Docker host and enrolls workers. `make installation-smoke` proves the end-to-end path (submit, assign, execute, store the result) on a throwaway project with a test-only workflow and scripted process. The default installation installs no workflow and no launch command, so its control plane refuses every run: G2 has no workflow resolution, and its only launch command is the test-only scripted process.

## Parts

- [`infra/installation/compose.yaml`](../infra/installation/compose.yaml): PostgreSQL and NATS with the digest-pinned images of the integration services, the control plane, a one-shot administrative entry, and the Linux worker. Each service keeps its data on a named volume.
- [`infra/installation/Dockerfile`](../infra/installation/Dockerfile): the control-plane and worker images, built on the digest-pinned Ubuntu 24.04 base with Node.js from its checksummed release tarball for linux/amd64 or linux/arm64. Both images name the unprivileged `taskelith` user (uid 10001) and the data root `/var/lib/taskelith`, and contain no credentials or state: the build context is a `git archive` of the tracked files with their uncommitted edits, so untracked and ignored files never reach an image. The control plane runs as `taskelith`; the worker container runs as described in [Worker container](#worker-container).
- [`infra/installation/worker-entrypoint.sh`](../infra/installation/worker-entrypoint.sh): the worker image's entrypoint, which delegates the container's cgroup subtree before the worker starts.
- [`infra/installation/smoke/`](../infra/installation/smoke/compose.yaml): the test-only Compose override and workflow of `make installation-smoke`.
- [`scripts/installation.sh`](../scripts/installation.sh): the steps the `make` targets run.
- The `worker-harnesses` target of the same Dockerfile: a worker image variant with the pinned Claude Code and Codex packages, installed from [`infra/installation/harnesses/`](../infra/installation/harnesses/package-lock.json) by `npm ci --ignore-scripts` against the lockfile's integrity hashes, owned by root, so that a harness, which runs as an execution under the execution account, cannot change them, with `DISABLE_AUTOUPDATER=1`. It exists for harness qualification; the composition runs the default `worker` image, which contains no harness. It is the last stage, so every build of this Dockerfile names its target, as the scripts do. Both harnesses stay `candidate` ([Claude Code](qualification/claude-code.md#linux-worker-image), [Codex](qualification/codex.md#linux-worker-image)).

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

On Linux a launch also needs `TASKELITH_CONTAINMENT_PARENT`, the absolute path of the delegated cgroup that holds each execution's containment, and `TASKELITH_EXECUTION_UID` and `TASKELITH_EXECUTION_GID`, the account the child runs as, which owns no cgroup of the worker. A missing or invalid value fails the worker's start and names the variable. A Linux worker without a launch command still reads `TASKELITH_CONTAINMENT_PARENT` when it is set, so that it reconciles the executions an earlier start left and removes their records; without it, those executions wait for a start that has it, and each is logged as `worker.reconciliation.deferred`.

The worker image always sets `TASKELITH_CONTAINMENT_PARENT=/sys/fs/cgroup/executions` and the execution account `TASKELITH_EXECUTION_UID=10003` and `TASKELITH_EXECUTION_GID=10003`, the image's `taskelith-exec` account, so the Linux worker container always reconciles. The composition sets no launch command; only the smoke's override does.

A worker whose broker is unreachable still starts: it retries the connection, and while offline it begins no launch authorization (see the [execution wire contracts](contracts/execution-wire-contracts.md) section 6 for the heartbeat and the inventory report it sends on each connection).

## Worker container

A Linux launch needs a delegated cgroup v2 subtree and a child under an execution account that owns no cgroup of the worker ([supervisor identity contract](contracts/supervisor-identity.md) section 8). The `worker` service therefore runs in a private cgroup namespace (`cgroup: private`), where `/sys/fs/cgroup` is the container's own cgroup, and its entrypoint lays it out as follows:

| Path | Holds |
| --- | --- |
| `/sys/fs/cgroup` | No process, so that its children can be delegated |
| `/sys/fs/cgroup/init` | Docker's init, the worker, and its supervisors |
| `/sys/fs/cgroup/executions` | The containment parent: one `<executionId>/` cgroup per execution |

The entrypoint starts as root (`user: "0:0"`), remounts `/sys/fs/cgroup` read-write, which Docker mounts read-only, moves every process into `init/`, creates `executions/`, and hands the data root to root when root does not own it yet, such as a 23a volume. It then runs the worker through `setpriv` with no capability but `SETUID`, `SETGID`, and `KILL`, which the supervisor needs to start the child under `taskelith-exec` and to signal it. The worker thus runs as root in its container, not as `taskelith`: a child that leaves root for the execution account loses every capability, which a worker under another user ID could not ensure. Root owns every cgroup file with mode 0644, so the execution account can move no process.

The service drops every other capability and adds only those its entrypoint needs (`CHOWN`, `DAC_OVERRIDE`, `KILL`, `SETGID`, `SETPCAP`, `SETUID`, `SYS_ADMIN`). It sets `no-new-privileges`, and `apparmor=unconfined`, because Docker's default AppArmor profile forbids the remount; it runs Docker's init (`init: true`), which reaps an execution whose supervisor ended first. No cgroup controller is enabled, since the worker declares no hard control yet. A container of the worker image started without these settings runs as `taskelith`, and its entrypoint refuses to start. `SYS_ADMIN` widens Docker's default seccomp filter for the whole container, and `apparmor=unconfined` lifts AppArmor's limit on unprivileged user namespaces: an execution under `taskelith-exec` can create a user namespace and mount inside it, which it cannot in a default container. The containment still holds, but the kernel surface is wider ([design](../openspec/changes/compose-installation-end-to-end/design.md), risks). Item 25 qualifies these settings on Linux hosts.

## Checks

- `make verify` validates the resolved composition and the Dockerfile: digest pins, checksummed Node.js tarballs, unprivileged services, named data volumes, localhost-only ports, secrets from the environment, and stream reservations that fit the broker's fixed file store.
- `make qualify-harnesses OUT=<dir>` (opt-in, outside `make verify`) builds the `worker-harnesses` variant for each platform in `PLATFORMS` (default `linux/amd64 linux/arm64`) from the pinned inputs, and runs the credential-free harness steps in it with `--network none`, writing the step results, the before-and-after listings, the changed paths, a root search for credential files, and the image metadata per architecture to `OUT`, which must be outside the worktree; each run replaces the directory of every platform it runs, such as `OUT/amd64`. A platform whose build or steps fail gets an `error.txt`, the other platforms still run, and the target then fails. `make verify` checks the variant's pins without building it.
- `make installation-smoke` (opt-in, outside `make verify`) runs the end-to-end path on a throwaway project, `taskelith-<id>-installation-smoke`, with a random database password and ephemeral ports. It builds the images, bootstraps, starts, and enrolls the Linux worker container, with the override [`smoke/compose.yaml`](../infra/installation/smoke/compose.yaml): the control plane knows the test-only workflow [`smoke/workflows.json`](../infra/installation/smoke/workflows.json), and the worker's launch command is a Node.js process that exits 0 after one second. [`scripts/installation-smoke.ts`](../scripts/installation-smoke.ts) then acts as the operator over the published API: it creates a run, submits a planning task of the `specs` stage, and reads the task result every second, for at most two minutes, until it is ended. It passes only if the attempt exited with code 0 and its start was proven, and prints the result. The target then removes the project with its volumes and images; on failure it first prints the control-plane and worker logs. It touches no other project or volume.
- `make verify-installation` (opt-in, outside `make verify`) builds the images, bootstraps, starts, and enrolls the Linux worker on a throwaway project with a random database password and ephemeral ports, restarts the composition, and removes it with its volumes and images. It also checks that the images run as `taskelith`, ship an empty data root, and do not contain an untracked file it creates for the build. When it fails, it prints the control plane's log before it removes the project.

## Broker storage

JetStream reserves the byte limit of each stream on the broker's disk when the stream is created. The installation fixes the broker's file store at 8 GiB (`max_file_store` in [`nats-server.conf`](../infra/installation/nats-server.conf)) and sets `TASKELITH_STREAM_MAX_BYTES` of the control plane to 1 GiB, so its five streams reserve 5 GiB. These are provisional local values ([operational targets](operational-targets.md) section 2). The `nats-data` volume needs 8 GiB of free disk; under Docker Desktop that is free space in its virtual machine's disk. The broker checks the reservations against the fixed store, not the disk: with less free disk the installation still starts, and broker writes fail later when the disk fills. If the reservations exceed the store, the control plane fails to start, and its error names the bytes the streams reserve.

## Limits

- Connections are plain: the control-plane API is HTTP, and NATS and PostgreSQL use no TLS. Ports are published on localhost only. TLS and the installation CA are G3 work.
- The enrollment token stays in the worker container's configuration. It is single-use and expires after 15 minutes.
- The images are built locally; publishing them to a registry is not part of this item.
