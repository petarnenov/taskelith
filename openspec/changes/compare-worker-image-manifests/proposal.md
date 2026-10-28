## Why

`make verify-worker-image-reproducible` compares the image IDs (`.Id`) of two builds of one revision without the build cache. On Docker's containerd image store (seen by the coordinator on Docker 29.8.2 with buildx 0.37.1), the image ID is the digest of the image index, and that index also carries BuildKit's default provenance attestation manifest, which differs per build. So the check fails for every revision, although the platform image manifest, its config, and its layers are the same in both builds (in the coordinator's run, the platform manifest `sha256:e20064fc9b01` in both builds, the image IDs `036dad823c49` and `abc511323824`).

## What Changes

- **Script.** `check-reproducible` of `scripts/installation.sh` compares what reproducibility means: the platform image's config digest, read from each build's BuildKit metadata file (`docker build --metadata-file`), and its ordered layer digests (`RootFS.Layers` of `docker image inspect`). On a mismatch it names each layer index whose digests differ and both config digests when they differ. A metadata file without a config digest, or a failed read of the layers, fails the check.
- **Spec.** The `local-installation` requirement "Opt-in reproducibility check" names the config and layer comparison instead of image IDs, and gains the scenario "Differing image index only".
- **Docs.** `docs/local-installation.md` describes the comparison.
- **Tests.** Script tests with a stub `docker`: a pass when only the image IDs differ, as the index digests of the containerd store do (fails before the change), a differing layer, differing configs over the same layers, a missing layer, a missing config digest, and a failed read of the layers.

Provenance attestations stay enabled (the owner's and the architect's decision). No new tool or dependency; no contract, schema, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-installation`: requirement "Opt-in reproducibility check" modified.

## Impact

- `scripts/installation.sh` (`check-reproducible` only), `docs/local-installation.md`, `test/installation-script.test.ts`.
- Out of scope: the rest of `scripts/installation.sh`, the requirement "Pinned image inputs", whose image ID claim is about the classic image store, where the image ID is the config digest, and `make integrate` cleanup.
