## Context

`check-reproducible` (`scripts/installation.sh`) builds the worker image twice from fresh `git archive` contexts of one revision without the build cache and, before this change, compared `docker image inspect --format '{{.Id}}'` of both images. What the image ID is depends on the image store:

- **Classic store** (`docker info` driver `overlay2` and similar): the image ID is the digest of the image config. The config holds `rootfs.diff_ids`, the ordered digests of the uncompressed layers, so equal IDs mean equal configs and layers.
- **containerd store**: the image ID is the digest of the descriptor the tag points to. BuildKit's image exporter on this store keeps the default provenance attestation, so the tag points to an image index with two manifests: the platform image and the attestation manifest. The attestation records the build, including per-build values, so the index digest, and with it the image ID, differs for every build even when the platform image is the same.

## Goals / Non-Goals

**Goals:** the check passes exactly when the two builds give the same platform image, on both stores and without network access, and a failure names what differs.

**Non-Goals:** disabling provenance attestations (the owner's and the architect's decision is to keep them), comparing compressed layer blobs or the attestation, cached builds, and the `worker-harnesses` variant.

## Decisions

1. **Compare the config digest and the ordered layer digests.** The image config digest identifies the platform image's content: the config, which includes the ordered `diff_ids`. The ordered layer digests are compared too, so that a failure can name the layer that differs. Both are content identities that do not depend on the store or on the compression of the stored blobs.
2. **Read the config digest from BuildKit's metadata file.** Each build gets `--metadata-file <temporary directory>/<first|second>.json`; BuildKit writes `containerimage.config.digest`, the platform image's config digest, on both stores. On this host's classic store it equals the image ID (measured with a scratch image on Docker 29.5.2: both `sha256:7942d2c71743...`). The script reads the value with `sed`, so the check needs no `jq`, and a metadata file without a `sha256:` hexadecimal digest fails the check rather than comparing empty strings.
3. **Read the layers with `docker image inspect`.** `{{range .RootFS.Layers}}{{.}} {{end}}` prints the uncompressed layer digests in order; on the containerd store `docker image inspect` resolves the tag to the host's platform image, whose layers it reports. A failed inspect fails the check with its status.
4. **Name what differs.** For each index up to the longer list, a differing pair prints `layer <index> differs: <first> and <second>`, with `none` for a layer that only one build has; differing configs print `the image configs differ: <first> and <second>`. Differing layers always differ the configs too, so both lines appear then; equal layers with differing configs print only the config line. The check passes and prints `both builds gave the worker image config <digest>` only when both are equal.

### Alternatives considered

- **`docker save` and its `manifest.json`.** Works without network on both stores, but streams each whole image through the pipe on every check, and on the containerd store lists compressed blob digests, so the two stores would compare different identities.
- **`docker image inspect --platform` or the `Manifests` field of the image inspect API.** Depends on the Docker API version and is not available on every engine the check runs on; it could not be measured on this host, whose engine uses the classic store.
- **`docker buildx imagetools inspect`.** Reads a registry, so it needs network access and a pushed image.
- **`--provenance=false`.** Ruled out by the owner's and the architect's decision.

## Risks / Trade-offs

- The containerd path is covered only by the stub test: this host uses the classic store, and the metadata key `containerimage.config.digest` on the containerd store is taken from BuildKit's exporter, not measured here.
- `--metadata-file` needs the BuildKit builder, which `docker build` uses by default since Docker Engine 23; the legacy builder rejects the flag and fails the build, so the check fails loudly rather than comparing nothing.
