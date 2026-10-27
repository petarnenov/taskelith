## MODIFIED Requirements

### Requirement: Pinned image inputs
The control-plane and worker images SHALL build from the digest-pinned Ubuntu 24.04 base and SHALL install Node.js only from a release tarball verified against a pinned SHA-256. Every image the composition pulls SHALL be pinned by digest. Two builds of the worker image from one commit on one Docker engine, with or without the build cache, SHALL give the same image ID, with the image's dates and file times no later than the commit time.

#### Scenario: Unpinned or altered input
- **WHEN** a pulled image lacks a digest or a Node.js tarball does not match its checksum
- **THEN** `make verify` or the image build fails

#### Scenario: Two builds of one commit
- **WHEN** the worker image is built twice from one commit on one Docker engine, the second time without the build cache
- **THEN** both builds give the same image ID

## ADDED Requirements

### Requirement: Opt-in reproducibility check
`make verify-worker-image-reproducible` SHALL build the worker image twice from fresh build contexts of one revision without the build cache, SHALL fail and name both image IDs when they differ, and SHALL remove both images. `make verify` SHALL check, without building, that every `RUN` of the worker image's stages clamps the file times it changes to the commit time.

#### Scenario: Differing builds
- **WHEN** the two builds of `make verify-worker-image-reproducible` give different image IDs
- **THEN** the target prints both IDs and fails

#### Scenario: Unclamped step
- **WHEN** a `RUN` of a stage of the worker image does not clamp its file times
- **THEN** `make verify` fails
