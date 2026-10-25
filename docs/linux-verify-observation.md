# Linux verify observation

Status: observation record of 2026-10-25, change `record-linux-verify-observation`. It records how `make doctor`, `make setup`, `make verify`, and `make verify-linux-cgroup` behaved on one Linux host. It is evidence for that host and revision only, not native acceptance under the [worker platform contract](worker-platforms.md). Earlier records ran these targets on macOS only, `make verify-linux-cgroup` included, through a Docker Linux VM on macOS x86_64 ([implement-process-supervisor](../openspec/changes/archive/2026-10-25-implement-process-supervisor/verification.md)).

## Host

| Item | Value |
| --- | --- |
| Distribution | Ubuntu 24.04.5 LTS |
| Kernel | Linux 6.8.0-147-generic, `#147-Ubuntu SMP PREEMPT_DYNAMIC` |
| Architecture | x86_64 |
| cgroup | v2 (`cgroup2fs` on `/sys/fs/cgroup`) |
| Docker | Engine 27.3.1 (build `ce12230`), cgroup v2 with the `systemd` driver; the user is in the `docker` group |
| Compose | v2.29.7 |
| Node.js | v24.22.1 and npm 12.2.1 through nvm, after `make setup`; the shell had v24.22.0 and npm 11.19.1 from `~/.local/bin` (see finding F1) |

Revision: a fresh worktree of `origin/dev` at `61e81f4`, with this change's files added before the runs. The Compose images were not cached on the host before the first run.

## Results

| Target | Result | Wall time |
| --- | --- | --- |
| `make doctor`, fresh worktree | 5 of 7 checks failed, as expected before setup: Node.js, npm, dependency tree, hooks, merge driver; git and Docker passed | 1.4 s |
| `make setup`, first run | Failed: it installed Node.js 24.22.1 with nvm and set the default alias, then its doctor step still saw v24.22.0 and reported the same 5 failures (finding F1) | 12.3 s |
| `make setup`, with nvm's v24.22.1 first in `PATH` | Passed: npm 12.2.1, `npm ci --ignore-scripts`, hooks, merge driver; all 7 doctor checks passed | 37.9 s |
| `make doctor`, after setup, same `PATH` | All 7 checks passed | 2.3 s |
| `make verify`, same `PATH`, cold image cache | Passed | 4 min 4 s |
| `make verify-linux-cgroup`, four runs | Passed in each run, 13 of 13 tests | 46.9 s with the image build, then 23.6 to 23.9 s |

`make verify` in detail:

- Comment length check passed.
- `make test` started PostgreSQL, NATS, and Toxiproxy as the isolated Compose project `taskelith-2480504214-verify`, pulled the images, waited until all three were healthy, ran `npm test`, and then stopped and removed the containers and the network. No container, network, or secrets directory under `/tmp/taskelith-services` remained afterwards.
- `npm test`: 883 tests in 11 suites, 868 passed, 0 failed, 0 cancelled, 15 skipped, in 76.6 s. The 15 skipped tests are the macOS-only tests of the data root and the worker supervisor. The Linux tests ran and passed: the `/proc` readers, the deadline clock and namespace, the cgroup v2 containment controls, the Linux self-check, the refusal of remote or volatile filesystems on Linux, and the child born in its containment and killed by cancellation. The integration tests against the pinned PostgreSQL 18.6 and NATS 2.15.1 with JetStream passed.
- Coverage of all files: 99.00% lines, 92.51% branches, 98.85% functions, above the 75% thresholds; every product module is in the report.
- Contract compatibility, dependency inventory (731 package paths, 41 reviewed license coverage gaps), strict OpenSpec validation (52 passed, 0 failed), the archive dry run, and package verification passed.
- `npm ci` printed an audit summary of 2 vulnerabilities (1 moderate, 1 high); `make verify` does not gate on it, and this record does not analyze it.

`make verify-linux-cgroup` ran the privileged container with `--cgroupns=private` and no network on the host's cgroup v2. Its 13 tests passed in each run: the self-check, a containment the execution account cannot leave, the exit held until the containment empties, cancellation of the whole containment, recovery after a supervisor is killed at CP5 to CP9 and CP11 without a second spawn, adoption after a worker restart and after a repeated kill, and an uncertain result when a recorded execution's directory is deleted.

## Findings

F1. **A Node.js outside nvm that comes earlier in `PATH` defeats the pinned Node.js.** The host had Node.js v24.22.0 in `~/.local/bin`, which comes before nvm's directory in `PATH`. `scripts/with-pinned-node.sh` runs `nvm use`, and nvm replaces its own entry in `PATH` where that entry already is instead of putting it first. The command then still finds `~/.local/bin/node`:

```text
$ NODE_PIN=24.22.1 bash scripts/with-pinned-node.sh use sh -c 'command -v node; node -v'
/home/petar/.local/bin/node
v24.22.0
```

As a result, `make setup` installs the pinned version and sets the nvm default but then fails. `make doctor` reports the Node.js and npm checks as failed with the remedy `make setup`, which does not help. `make verify` stops at its toolchain check, and so does the `pre-push` hook. This contradicts the `development-environment` scenario "Shell on another Node.js after setup", which expects the pinned version when nvm has it installed. The cause is the host's `PATH`, not Linux itself. The workaround used for the runs above was to put `~/.nvm/versions/node/v24.22.1/bin` first in `PATH` for these commands. No fix is part of this change; the coordinator assigns one separately.

## Not observed

- Linux on arm64, and the worker image of [ADR 0007](decisions/0007-g0-closure.md).
- The CI workflow, which this record does not change.
