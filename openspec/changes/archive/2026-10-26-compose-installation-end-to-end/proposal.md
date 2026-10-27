## Why

G2 work item 23 ([docs/g2-plan.md](/docs/g2-plan.md)) was split by the coordinator ([23a proposal](/openspec/changes/archive/2026-10-25-compose-minimal-local-installation-images/proposal.md)): 23a packaged the images, the composition, and the `make` targets; 23b, this change, adds "the end-to-end smoke (submit, assign, execute) and anything the later runtime needs", now that items 20 and 21 are merged.

The runtime needs more of the Linux worker container than 23a gave it. A Linux launch needs a delegated cgroup v2 containment parent and an execution account that owns no cgroup of the worker (supervisor identity contract section 8), and item 20d2 left the obligation that the Linux worker image always sets `TASKELITH_CONTAINMENT_PARENT`, so that start reconciliation and the unrecorded-process scan run ([20d2 design](/openspec/changes/archive/2026-10-26-implement-worker-contact-and-offline/design.md) OQ2). The 23a container runs the worker as the unprivileged `taskelith` user in a read-only cgroup namespace, where none of this is possible.

## What Changes

- **Delegated cgroup subtree.** The worker container runs in a private cgroup namespace. A new entrypoint, `infra/installation/worker-entrypoint.sh`, remounts `/sys/fs/cgroup` read-write, moves every process into the leaf `init/`, creates the containment parent `executions/` as its sibling, and then runs the worker through `setpriv` with the bounding set reduced to `SETUID`, `SETGID`, and `KILL`.
- **Execution account.** The worker image adds the `taskelith-exec` account (uid and gid 10003) and always sets `TASKELITH_CONTAINMENT_PARENT=/sys/fs/cgroup/executions`, `TASKELITH_EXECUTION_UID`, and `TASKELITH_EXECUTION_GID`.
- **Worker privileges.** The worker process runs as root inside its container, with only those three capabilities, instead of as `taskelith`: a child that changes from root to the execution account loses every capability, which an unprivileged worker cannot guarantee. The Compose service starts as root, drops all capabilities but the seven its entrypoint needs, sets `no-new-privileges`, and runs Docker's init to reap orphaned executions. The control plane and NATS stay unprivileged.
- **Smoke.** `make installation-smoke` builds the images, bootstraps a throwaway project with random secrets and ephemeral ports, starts it, enrolls the Linux worker container, and then, as an operator over the API, creates a run of a test-only workflow, submits a planning task, and waits until the control plane stores an ended result whose attempt exited with code 0. It then removes the project with its volumes and images. A Compose override, `infra/installation/smoke/compose.yaml`, gives the control plane the test-only workflow and the worker the test-only scripted process; the default installation gets neither.
- **Documents.** `docs/local-installation.md` describes the worker container's layout, privileges, and the smoke.

## Capabilities

### Modified Capabilities

- `local-installation`: the worker's privileges change, the worker container delegates a cgroup v2 subtree and always names its containment parent and execution account, and an opt-in end-to-end smoke is added.

## Impact

Build files, a script, the worker image's entrypoint, tests, and documentation. No product code, published CLI command, OpenAPI, AsyncAPI, or JSON schema, or npm dependency changes; `apps/worker` and `apps/control-plane` are unchanged. The commits use `build`, `test`, and `docs`.
