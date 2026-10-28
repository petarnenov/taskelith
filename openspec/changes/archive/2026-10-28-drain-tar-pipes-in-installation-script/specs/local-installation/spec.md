## MODIFIED Requirements

### Requirement: Opt-in reproducibility check
`make verify-worker-image-reproducible` SHALL build the worker image twice from fresh contexts of one revision without the build cache, SHALL compare their image config digests and ordered layer digests, SHALL fail naming each differing layer index and, when they differ, both config digests, and SHALL remove both images. `make verify` SHALL check, without building, that every `RUN` of the stages the worker image is built or copies from ends with the clamp of file times to `SOURCE_DATE_EPOCH`.

#### Scenario: Differing builds
- **WHEN** the two builds of `make verify-worker-image-reproducible` give different image configs or layers
- **THEN** the target names each differing layer index and both config digests when they differ, and fails

#### Scenario: Differing image index only
- **WHEN** the two builds give one image config and the same layers, but different image IDs, as the containerd image store gives when each build's index carries its own provenance attestation
- **THEN** the target passes

#### Scenario: Unclamped step
- **WHEN** a `RUN` of a stage the worker image is built or copies from does not end with the clamp
- **THEN** `make verify` fails

#### Scenario: Tar reader stops before the end of its stream
- **WHEN** the tar that unpacks a build context or reads a saved image's `manifest.json` exits successfully before its writer has written the whole stream
- **THEN** the check drains the rest of the stream, its writer gets no SIGPIPE, and the check reports on the images instead of failing with status 141; a failing tar or writer still fails the check
