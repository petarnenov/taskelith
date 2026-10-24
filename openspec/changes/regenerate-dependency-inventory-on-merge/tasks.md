## 1. Merge driver and detection

- [x] 1.1 Add `.gitattributes` entries for both inventory files, and configure the driver in `make hooks`, `make setup`, and `make doctor`.
- [x] 1.2 Add the provenance staleness check, use it in check mode, and add the `post-merge` hook and `make dependency-inventory`.
- [x] 1.3 Test the staleness check, the hook script, the environment checks, and a real git merge through the repository's attributes.

## 2. Documentation

- [x] 2.1 Describe the flow in the inventory guide, the agent task protocol (worker step 1, coordinator step 2), the release flow, and the README.

## 3. Verification and review

- [ ] 3.1 Run `make verify`.
- [ ] 3.2 Obtain independent review (Codex Sol medium, by rotation) and record results.
