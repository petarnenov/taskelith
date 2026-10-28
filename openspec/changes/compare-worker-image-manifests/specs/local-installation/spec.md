## MODIFIED Requirements

### Requirement: Opt-in reproducibility check
`make verify-worker-image-reproducible` SHALL build the worker image twice from fresh build contexts of one revision without the build cache, SHALL compare their image config digests and ordered layer digests, not their image IDs, SHALL fail naming each differing layer index and config digest, and SHALL remove both images. `make verify` SHALL check, without building, that every `RUN` of the stages the worker image is built or copies from ends with the clamp of file times to `SOURCE_DATE_EPOCH`.

#### Scenario: Differing builds
- **WHEN** the two builds of `make verify-worker-image-reproducible` give different image configs or layers
- **THEN** the target names each differing layer index and both config digests when they differ, and fails

#### Scenario: Differing image index only
- **WHEN** the two builds give one image config and the same layers, but different image IDs, as the index digests of the containerd image store with per-build provenance attestations
- **THEN** the target passes

#### Scenario: Unclamped step
- **WHEN** a `RUN` of a stage the worker image is built or copies from does not end with the clamp
- **THEN** `make verify` fails
