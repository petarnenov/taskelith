# local-installation Specification

## Purpose
The packaged minimal local installation of Taskelith: the control-plane and Linux worker images, their Docker Compose composition with PostgreSQL and NATS, and the `make` targets that operate it.

## Requirements

### Requirement: Pinned image inputs
The control-plane and worker images SHALL build from the digest-pinned Ubuntu 24.04 base and SHALL install Node.js only from a release tarball verified against a pinned SHA-256. Every image the composition pulls SHALL be pinned by digest. Two builds of the worker image from one commit without the build cache, on one Docker engine with the classic image store, SHALL give the same image ID, with the image's dates and file times no later than the commit time.

#### Scenario: Unpinned or altered input
- **WHEN** a pulled image lacks a digest or a Node.js tarball does not match its checksum
- **THEN** `make verify` or the image build fails

#### Scenario: Two builds of one commit
- **WHEN** the worker image is built twice from one commit without the build cache, on one Docker engine with the classic image store
- **THEN** both builds give the same image ID

### Requirement: Unprivileged services with volume data
The control plane and NATS SHALL run as non-root users. The worker container SHALL start as root only for its entrypoint, and the worker SHALL then run with no capability but `SETUID`, `SETGID`, and `KILL`, so that a child under the execution account has none. The data of PostgreSQL, NATS, the control plane, and the worker SHALL live on named volumes. The images SHALL contain no credentials and no data-root state, and SHALL be built only from tracked files.

#### Scenario: Fresh image
- **WHEN** the control-plane or worker image is built
- **THEN** its default `USER` is `taskelith`, its data root is empty, and an untracked file of the checkout is absent

#### Scenario: Worker privileges
- **WHEN** the composition starts the worker
- **THEN** the service drops every capability but those its entrypoint needs, sets `no-new-privileges`, and the entrypoint runs the worker with `SETUID`, `SETGID`, and `KILL` only

### Requirement: Make-driven operation
`make` targets SHALL build the images, bootstrap the installation, start and stop it, enroll the Linux worker container, and issue an enrollment token for a native worker. Bootstrap SHALL initialize the installation before the broker starts with the authority it wrote. Secrets SHALL come from the environment, never from the repository or the images. When the control plane does not become healthy, the start SHALL stop it and print its last error.

#### Scenario: Restart
- **WHEN** an enrolled installation is stopped and started
- **THEN** the services and the worker run again with their volumes, without a new enrollment

#### Scenario: Failed start
- **WHEN** the control plane does not become healthy within the start's wait
- **THEN** the target stops the control plane, prints its last error, and fails

### Requirement: Opt-in bring-up check
`make verify-installation` SHALL build the images, bootstrap, start, and enroll a throwaway installation with random secrets, wait until its worker is `admitted` with `linux-containment` `passed`, restart it, wait for that again from a report of the new start, and remove it with its volumes. `make verify` SHALL check the composition and the Dockerfile without building or starting them. A failed check SHALL print the control-plane log before it removes the project.

#### Scenario: Successful check
- **WHEN** `make verify-installation` runs on a Docker host
- **THEN** the worker enrolls and is `admitted` with `linux-containment` `passed` before and after the restart, every service runs after the restart, and the project is removed

#### Scenario: Failed check
- **WHEN** a step of `make verify-installation` fails
- **THEN** the control-plane log is printed, and the project is removed

### Requirement: Harness image variant
The worker image SHALL have a separate `worker-harnesses` variant that adds the agent harness packages pinned in the qualification records, installed from a tracked lockfile with every package checked against its integrity hash and no install scripts run. The default worker image SHALL stay without harnesses. Root SHALL own the installed harnesses, so that the execution account cannot change them, and the variant SHALL set every self-update switch that a harness reads from the environment.

#### Scenario: Default worker image
- **WHEN** the default `worker` target is built
- **THEN** it contains no harness package

### Requirement: Harness variant checks
`make verify` SHALL check the harness variant's pins without building the image. An opt-in `make` target SHALL build the variant for each selected Linux architecture of the worker matrix, run the credential-free qualification steps in it, and record a failed architecture without stopping the others.

#### Scenario: Pin drift
- **WHEN** the harness manifest, the harness lockfile, or a qualification record names a version or integrity hash that the others do not
- **THEN** `make verify` fails

### Requirement: Bounded broker storage
The installation's broker SHALL use a fixed JetStream file store of 8 GiB, and the control plane SHALL limit each stream to 1 GiB through `TASKELITH_STREAM_MAX_BYTES`, so that the stream reservations fit the file store whatever the host's free disk. `make verify` SHALL check that the reservations of all streams fit the fixed file store.

#### Scenario: Host with little free disk
- **WHEN** the installation starts on a host whose free disk is below the 10 GiB targets of all streams but holds the 8 GiB file store
- **THEN** the control plane creates its streams and becomes healthy

### Requirement: Delegated worker containment
The worker container SHALL run in a private cgroup v2 namespace whose root holds no process: the worker SHALL sit in the leaf `init/` and executions under the sibling `executions/`. The worker image SHALL always set `TASKELITH_CONTAINMENT_PARENT` to that sibling and name an execution account that owns no cgroup of the worker.

#### Scenario: Worker start
- **WHEN** the worker container starts
- **THEN** the worker runs in `init/`, its containment parent exists outside its own cgroup, and the execution account can write no `cgroup.procs` of the worker, which `make installation-smoke` checks

#### Scenario: No delegation
- **WHEN** the container cannot be delegated, such as without root or without cgroup v2
- **THEN** the entrypoint fails and names the cause, and the worker does not start

### Requirement: Opt-in end-to-end smoke
`make installation-smoke` SHALL build, bootstrap, start, and enroll a throwaway installation with random secrets, then create a run of a test-only workflow and submit an admitted task through the API. It SHALL pass only when the Linux worker container executes the test-only scripted process through the supervisor and the control plane stores an ended result that exited with code 0.

#### Scenario: Successful smoke
- **WHEN** `make installation-smoke` runs on a Docker host
- **THEN** the stored task result is ended with exit code 0, and the throwaway project is removed with its volumes and images

#### Scenario: Failed smoke
- **WHEN** a step fails or the task does not end within two minutes
- **THEN** the control-plane and worker logs are printed, the target fails, and the throwaway project is removed

### Requirement: Execution namespace confinement
The worker Compose service SHALL run with a seccomp profile under which no process of the worker container, the execution account's included, can call `unshare` or `setns` or create a namespace through `clone` or `clone3`. `mount` and the other calls SHALL stay as Docker's default profile grants them to a container with `CAP_SYS_ADMIN`.

#### Scenario: Execution account refused a namespace
- **WHEN** `make scenario-worker-namespace-confinement` runs, as the execution account through a `setpriv` equal to the worker's, whose status fields equal those of a running execution, `unshare -U` and `unshare -Urm` with `mount -t tmpfs` in the worker container
- **THEN** both are refused with `EPERM`, and the scenario records its result with the OS, architecture, kernel, file system, versions, and the SHA-256 of the profile the container runs with

#### Scenario: Every namespace call refused by the profile
- **WHEN** the scenario calls, as the execution account with the status of a running execution, `clone3`, `clone` with `CLONE_NEWUSER`, and `setns` into a user namespace
- **THEN** `clone3` answers `ENOSYS` and the other two are refused with `EPERM`; `clone3` with `ENOSYS` and `setns` with `EPERM` instead of `EINVAL` tell the profile from a host-wide user namespace limit, while `clone` with `EPERM` only proves the refusal

#### Scenario: Profile not applied
- **WHEN** the worker container's inspected security options name no seccomp profile, or one other than the tracked worker profile
- **THEN** the scenario fails

#### Scenario: Delegation and executions unaffected
- **WHEN** the worker container starts with the profile
- **THEN** the entrypoint delegates the cgroup subtree, a task's execution runs in its own cgroup under `executions/` and exits 0, and `make installation-smoke` passes

### Requirement: Pinned worker seccomp profile
The worker's seccomp profile SHALL be derived from a tracked, byte-for-byte copy of Docker's default profile, pinned by upstream commit and SHA-256, with only the `CAP_SYS_ADMIN` carve-out for the namespace calls removed. `make verify` SHALL check the copy and the derivation.

#### Scenario: Profile drift
- **WHEN** the upstream copy no longer matches its pinned SHA-256, or the tracked profile differs from its derivation
- **THEN** `make verify` fails

### Requirement: Opt-in reproducibility check
`make verify-worker-image-reproducible` SHALL build the worker image twice from fresh build contexts of one revision without the build cache, SHALL fail and name both image IDs when they differ, and SHALL remove both images. `make verify` SHALL check, without building, that every `RUN` of the stages the worker image is built or copies from ends with the clamp of file times to `SOURCE_DATE_EPOCH`.

#### Scenario: Differing builds
- **WHEN** the two builds of `make verify-worker-image-reproducible` give different image IDs
- **THEN** the target prints both IDs and fails

#### Scenario: Unclamped step
- **WHEN** a `RUN` of a stage the worker image is built or copies from does not end with the clamp
- **THEN** `make verify` fails

### Requirement: TLS of the local installation
The composition's NATS SHALL refuse plain clients, the control plane SHALL publish the worker API and the browser endpoint over HTTPS on localhost, both on the installation's API certificate, and the Linux worker SHALL trust the installation CA from a read-only volume. `make installation-certificates` SHALL issue the server certificates again, install the broker's files, and restart the running broker and control plane. PostgreSQL SHALL stay plain on the Compose network, unpublished.

#### Scenario: Plain broker client
- **WHEN** a client connects to the composition's NATS without TLS
- **THEN** the server refuses the connection

#### Scenario: Re-issued certificates
- **WHEN** `make installation-certificates` runs on a started installation
- **THEN** the broker and the control plane serve the new certificates, and the worker reconnects with the same CA

#### Scenario: Browser certificate in the composition
- **WHEN** `TASKELITH_BROWSER_TLS_CERT` and `TASKELITH_BROWSER_TLS_KEY` are set on the host of the composition
- **THEN** the browser endpoint still serves the installation's API certificate

### Requirement: Bounded admission wait of the bring-up check
Each admission wait of `make verify-installation` SHALL read the workers view through the administrative entry and SHALL fail as a timeout when the worker is not admitted within `TASKELITH_ADMISSION_SECONDS`, a positive whole number of seconds read in base 10, by default 300, killing a read still running then. Any other value SHALL be a usage error before any read.

#### Scenario: Admission timeout
- **WHEN** the worker is still `awaiting-self-check` when the bound ends
- **THEN** the check fails and says that the worker was not admitted within the bound

#### Scenario: Hung read
- **WHEN** a read of the workers view is still running when the bound ends
- **THEN** the read is killed and the check fails as a timeout

#### Scenario: Bound of zero
- **WHEN** `TASKELITH_ADMISSION_SECONDS` is `0`
- **THEN** the check fails as a usage error without reading the workers view

### Requirement: Outcomes of the admission wait
An admission wait SHALL read again, until its bound, after an `unavailable` read or a read with no output. It SHALL fail at once on `self-check-failed`, printing each failed check ID with its redacted details, on any other read failure, and on an admission without a passed `linux-containment` check.

#### Scenario: Unavailable read
- **WHEN** a read of the workers view fails with `unavailable` before the bound
- **THEN** the wait reads the view again

#### Scenario: Other read failure
- **WHEN** a read of the workers view fails with `forbidden`
- **THEN** the check fails without another read

#### Scenario: Failed self-check
- **WHEN** the workers view shows the worker `self-check-failed` with a failed `linux-containment` result
- **THEN** the check fails without another read and prints `linux-containment` with its details

#### Scenario: Containment check not run
- **WHEN** the worker is `admitted` with `linux-containment` `not-applicable`
- **THEN** the check fails

#### Scenario: Report of the earlier start
- **WHEN** the wait after the restart sees only the report consumed before the restart
- **THEN** it keeps waiting for a report of the new start
