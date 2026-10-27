## Context

The worker image is the `worker` target of `infra/installation/Dockerfile`. `scripts/installation.sh` builds it from a `git archive` of the tracked files with the pins of the `Makefile` (digest-pinned Ubuntu 24.04 base, Node.js tarball checked by SHA-256). `run-g2-native-acceptance-linux-host` recorded two builds of one commit with different worker image digests, and the G2 closure (ADR 0015, `docs/decisions/0015-g2-closure.md:133`, decision 5) left reproducibility to this change.

## Diagnosis

Host: Linux 6.8.0-147-generic, x86_64; Docker Engine 27.3.1 with the classic image store (storage driver `overlay2`), buildx v0.17.1, BuildKit v0.16.0 (`default` builder, `docker` driver). Revision: `21f399a5`, clean. Each build used a fresh `git archive` of `HEAD` and the arguments of `build_image` in `scripts/installation.sh` for the `worker` target; build B added `--no-cache`. The images were exported with `docker save` and compared entry by entry (name, mode, owner, size, mtime, content SHA-256, link, PAX headers).

| Build | Options | Image ID |
| --- | --- | --- |
| A | the arguments of `build_image`, with the build cache | `sha256:d16ac5ba4eed08bdaf14eb082d72c19603f0e8ec25e3afe27358a99449d67527` |
| B | the same with `--no-cache`; BuildKit still took the checksum-pinned `ADD` from its cache | `sha256:6f0e03d7dee93a4fe3143b4988cd532cc9be522deb431a46e45d635483a66f75` |

Of the 7 layers, 5 differ (layers 1, the base, and 6, the empty `WORKDIR`, match). Every difference is a time:

1. **Image dates.** The config's `created` and every history entry carry the build time.
2. **File times of build steps.** Layer 2 (`ADD` of the tarball): `tmp`. Layer 3 (unpacking): `tmp`, `usr/local`, and the whiteout of the tarball. Layer 4 (`useradd taskelith`): 9 of 17 entries in `etc` and `var`. Layer 5 (`COPY --from=build /app /opt/taskelith`): 3064 of 6163 entries, the build outputs and installed packages, and `opt` itself, which gains the new entry. Layer 7 (`useradd taskelith-exec`): 13 of 14 entries. File contents, modes, owners, and lists are otherwise identical, so `npm ci`, `npm run build`, and `npm prune` write the same bytes.
3. **Password-change day.** `/etc/shadow` differs in content in layers 4 and 7: `useradd` writes the day of the build. Build A reused layers cached on 2026-10-25, build B ran on 2026-10-27.

Ruled out: the base is pinned by digest and layer 1 matches; the Node.js tarball is checked by SHA-256 and its file time matches; there is no apt step, and the npm cache stays in the unshipped `build` stage; package versions come from the lockfile.

Probes of fixes with standard BuildKit features:

- `--build-arg SOURCE_DATE_EPOCH=<commit time>` with `--no-cache`, twice (builds D and E): the config date and every history date of the build became the commit time, but `sha256:652394ca1b0790febd98d3375861ffad2f4aafec77181569b801eca7364d2265` and `sha256:27f8dc7709f5e6a12100bfa4d6cfaa1182466b34102813d98938ef95be24e719` still differ, on the file times of the same layers.
- The exporter option `rewrite-timestamp=true` (`--output type=docker,rewrite-timestamp=true`, build C): accepted, but the classic image store ignores it; its layers equal build B's, with times after the commit time.
- In a container of the base, `useradd` with `SOURCE_DATE_EPOCH=1700000000` wrote day 19675 (`passwd` 1:4.13+dfsg1-4ubuntu3.2), so it honors the variable.

## Gate decision

Not gated. The fix uses BuildKit's `SOURCE_DATE_EPOCH` build argument and `find` and `touch` of the pinned base; it adds no tool or dependency, keeps the base image and its digest, and needs no registry or publishing step. Rejected because they are gated or change the host: the `docker-container` buildx driver, which runs a `moby/buildkit` image and honors `rewrite-timestamp` (a new tool), and the containerd image store, a daemon setting of every Docker host.

## Decisions

1. **The commit time is the epoch.** `build_image` passes `SOURCE_DATE_EPOCH`, the committer time of the revision it archives: the commit ID of `HEAD` for a clean tree, resolved once with `git rev-parse --verify HEAD`, or the `git stash create` commit for one with uncommitted edits. A failure of either stops the build before any image is built (review pass 1, findings 1 and 2). `git archive` writes that time as the time of every file, so the context's files are never newer than the epoch. BuildKit then writes it as the image's dates and passes it to `RUN`, where `useradd` takes its day from it.
2. **Each `RUN` clamps the times it changes.** A step's layer holds every entry it changed, with its time, so a later step cannot fix it. Each `RUN` of the stages `node-amd64`, `node-arm64`, `build`, `runtime`, and `worker` therefore ends with `find <paths> -newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +` over the paths it writes. Older files, such as the base's, are left alone, so no unchanged file is copied into a layer. `${SOURCE_DATE_EPOCH:?}` fails a build without the argument instead of building an image that is not reproducible. The `/etc` steps skip `/etc/hosts`, `/etc/hostname`, and `/etc/resolv.conf`, the read-only mounts of `RUN`.
3. **No unclamped `ADD` or `COPY` layer.** An `ADD` or `COPY` writes the time of the parent it adds to, such as `tmp` or `opt`, and cannot clamp it. Node.js is therefore unpacked into `/node` in its download stage, which never ships, and `COPY --from=node-files /node /usr/local` copies the clamped tree onto the existing `/usr/local`. The `build` stage builds in `/opt/taskelith` and clamps `/opt`, and the runtime copies `/opt` onto the existing `/opt`, so the copy takes the source's clamped times. The `node-files` stage aliases `node-${TARGETARCH}`, because `COPY --from` names a stage. A side effect: the worker image no longer carries the 58 MB tarball layer.
4. **The check builds twice without the cache.** `installation.sh check-reproducible` resolves one commit ID, unpacks a fresh context of it for each build, so a commit made meanwhile changes neither build, builds the `worker` target twice with `--no-cache`, compares the two image IDs, and removes the images it built on exit; a failed removal is reported and fails a check that passed, and a failed build keeps its status (review pass 1, finding 3). With the classic image store the image ID is the digest of the config, which lists the digest of every uncompressed layer, so equal IDs mean equal layers and config. There is no local manifest digest, because nothing is pushed. `make verify-worker-image-reproducible` runs it with the pins; it stays out of `make verify`, because it needs Docker and takes minutes, like `make verify-installation`.
5. **`make verify` checks the Dockerfile.** A test of `test/installation-composition.test.ts` requires `ARG SOURCE_DATE_EPOCH` and the clamp at the end of every `RUN` of the worker image's stages, and that the `node` stage only copies the unpacked Node.js.
6. **The harness qualification passes the epoch.** The `worker-harnesses` variant builds on the `worker` stage, which now requires the argument, so `scripts/harness-qualification.sh` passes the commit time of its tree.

## Review checklist

`make findings ARGS="checklist --capability local-installation,native-worker-acceptance,worker-platform-foundation --files Makefile,**/Dockerfile*,scripts/installation.sh,docker-compose*.yml,deploy/**"`, most frequent archived categories first:

1. docs (2): `docs/local-installation.md` describes the fixed dates and the new target.
2. contract-drift (1): the spec delta, the doc, the Dockerfile, and the scripts state the same property.
3. error-handling (1): a missing `SOURCE_DATE_EPOCH` fails the build; the check removes both images on success and failure.
4. missing-fail-before-test (1): every new test fails before the change (verification, "Evidence check").
5. process (1): the change follows worker steps 2 to 6.

Record quality: docs (19), evidence-mismatch (17), spec-wording (10), stale-citation (10), contract-drift (4), process (2). Every digest, count, and line reference in `verification.md` is copied from the runs it names.

## Open questions

- Only the classic image store of Docker Engine 27.3.1 with BuildKit v0.16.0 was measured. With the containerd image store the image ID is a manifest digest that also covers compressed layers; that and other BuildKit versions are not verified.
- The `harnesses` stage of the `worker-harnesses` variant still writes unclamped times, so that variant is not claimed to be reproducible.
- The control-plane image shares every changed stage but was not built twice.
- ADR 0015 (`docs/decisions/0015-g2-closure.md:133`) calls the change "not yet in the repository"; updating that entry once this change is integrated is the coordinator's decision.
