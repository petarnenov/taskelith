## 1. Merge driver and detection

- [x] 1.1 Add `.gitattributes` entries for both inventory files, and configure the driver in `make hooks`, `make setup`, and `make doctor`.
- [x] 1.2 Add the provenance staleness check, use it in check mode, and add the `post-merge` hook and `make dependency-inventory`.
- [x] 1.3 Add the `pre-push` checks for uncommitted inventory changes and for pushed commits other than the checked-out one, with the hook helpers on Node.js built-ins only and the hooks on the pinned Node.js.
- [x] 1.4 Test the staleness check, both hook scripts without `node_modules`, the environment checks, and a real git merge through the repository's attributes.
- [x] 1.5 Isolate the git fixture tests from the environment that git hooks export, and test that isolation.

## 2. Documentation

- [x] 2.1 Describe the flow in the inventory guide, the agent task protocol (worker step 1, coordinator step 2), the release flow, and the README.

## 3. Verification and review

- [x] 3.1 Run `make verify`.
- [x] 3.2 Obtain independent review (Codex Sol medium, by rotation) and record results.
