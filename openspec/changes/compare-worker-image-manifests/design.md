## Context

`check-reproducible` (`scripts/installation.sh`) builds the worker image twice from fresh `git archive` contexts of one revision without the build cache and, before this change, compared `docker image inspect --format '{{.Id}}'` of both images. What the image ID is depends on the image store:

- **Classic store** (`docker info` driver `overlay2` and similar): the image ID is the digest of the image config. The config holds `rootfs.diff_ids`, the ordered digests of the uncompressed layers, so equal IDs mean equal configs and layers.
- **containerd store**: the image ID is the digest of the descriptor the tag points to. BuildKit's image exporter on this store keeps the default provenance attestation, so the tag points to an image index with two manifests: the platform image and the attestation manifest. The attestation records the build, including per-build values, so the index digest, and with it the image ID, differs for every build even when the platform image is the same.

## Goals / Non-Goals

**Goals:** the check passes exactly when the two builds give the same platform image, on both stores and without network access, and a failure names what differs.

**Non-Goals:** disabling provenance attestations (the owner's and the architect's decision is to keep them), comparing compressed layer blobs or the attestation, cached builds, and the `worker-harnesses` variant.

## Decisions

1. **Compare the config digest and the ordered layer digests.** The image config digest identifies the platform image's content: the config, which includes the ordered `diff_ids`. The ordered layer digests are compared too, so that a failure can name the layer that differs. Both are content identities that do not depend on the store or on the compression of the stored blobs.
2. **Read the config digest from the `manifest.json` of the saved image.** `docker image save <image> | tar -xOf - manifest.json` gives the Docker-compatible manifest of the saved image, whose one entry names the platform image's config blob as `blobs/sha256/<hex>` (the OCI layout of Docker Engine 25 and later); a blob's name is its digest, so the config digest is `sha256:<hex>`. This works locally, without network access, on both stores, and does not depend on the builder. The first fix read `containerimage.config.digest` from BuildKit's `--metadata-file`, but BuildKit adds that key only when it returns the image manifest itself; when it exports an index with attestations, the containerd case, the metadata has no config digest (review pass 1). On this host's classic store the `Config` entry equals the image ID for `busybox:latest`, `alpine:3.20`, and a locally built scratch image (Docker 29.5.2). The script reads the entry with `grep` and `sed`, so the check needs no `jq`; a failed save or `tar`, a manifest with no or more than one `Config` entry, or an entry that is not a `blobs/sha256/` digest of 64 hexadecimal digits fails the check with a message that names the image, rather than comparing empty strings.
3. **Read the layers with `docker image inspect`.** `{{range .RootFS.Layers}}{{.}} {{end}}` prints the uncompressed layer digests in order; on the containerd store `docker image inspect` resolves the tag to the host's platform image, whose layers it reports. A failed inspect fails the check with its status.
4. **Name what differs.** For each index up to the longer list, a differing pair prints `layer <index> differs: <first> and <second>`, with `none` for a layer that only one build has; differing configs print `the image configs differ: <first> and <second>`. Differing layers always differ the configs too, so both lines appear then; equal layers with differing configs print only the config line. The check passes and prints `both builds gave the worker image config <digest>` only when both are equal.

### Alternatives considered

- **BuildKit's `--metadata-file`.** Used by the first fix; it names no config digest when BuildKit exports an index with attestations, that is on the containerd store (review pass 1).
- **The `Layers` of the saved `manifest.json`.** On the containerd store they are compressed blob digests, so the two stores would compare different identities; the layers are read with `docker image inspect` instead, and only the config entry, an uncompressed blob on both stores, is taken from the save.
- **`docker image inspect --platform` or the `Manifests` field of the image inspect API.** Depends on the Docker API version and is not available on every engine the check runs on; it could not be measured on this host, whose engine uses the classic store.
- **`docker buildx imagetools inspect`.** Reads a registry, so it needs network access and a pushed image.
- **`--provenance=false`.** Ruled out by the owner's and the architect's decision.

## Risks / Trade-offs

- The containerd path is covered only by the stub tests: this host uses the classic store. That `docker image save` of an index with attestations writes one `manifest.json` entry, for the platform image, is assumed from the review's reading of the exporters, not measured here; if an engine wrote an entry for the attestation too, the check fails with `names 2 image configs, not one` rather than passing.
- `docker image save` streams each whole image through `tar` on every check, which costs time and no disk space; the check is opt-in and outside `make verify`.
- An engine before Docker 25 names the config `<hex>.json` rather than `blobs/sha256/<hex>`; the check then fails with `names no image config blob`.
