## Why

After the dev-branch flow was adopted, the owner authorized the prepared GitHub settings: protection for `main` (pull request with a passing `verify` check, administrators included, no force pushes or deletion), protection for `dev` (no force pushes or deletion), and disabling squash merges. The owner also asked to fix the evidence-check findings in the "Sources" section of `docs/releases.md`.

## What Changes

- Record the applied repository settings and describe them in `docs/releases.md`.
- Pin the two npm sources to a commit and a tag, and label the two unversioned sources as "docs".

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `integration-flow`: adds protected branches and disabled squash merges to the promotion flow.

## Impact

Repository settings changed on GitHub; documentation only in the repository. No runtime, CI, or package impact.
