# Verification: require-existing-project-for-runs

Written after the implementation; see `tasks.md` 3.1.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `d97b44d7748b8da423ea1363a2d1dc4fecfc12a7`; tests 4779, pass 4770, fail 0, skipped 9; all files 99.45% lines, 92.85% branches, 98.88% functions.
- `npm run openspec -- validate require-existing-project-for-runs --strict`: passed, `Change 'require-existing-project-for-runs' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 115 file(s); every pass summary file is valid: 95 file(s); every route file is valid: 48 file(s).`.
- Spec diff against the merge base `aca638890748` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->
