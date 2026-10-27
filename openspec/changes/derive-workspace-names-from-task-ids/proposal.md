## Why

Review pass 2 of G3 item 6 in the change `revalidate-g3-foundations` (finding M2, `contract-drift`) found that the Git workspace contract's safe-name rule refuses client-chosen task identifiers. The contract allowed only letters, digits, `-`, and `_` in an attempt or task identifier, refused others with `invalid` and reason `unsafe-name`, and assumed that the control plane mints identifiers in that form (an obligation on G3 item 9). G2 task identifiers are client-chosen `Identifier` values of 1 to 128 printable ASCII characters, so a task such as `feature/login` or `v1.2` would fail every prepare, on every attempt, with no recovery.

## What Changes

- Scope: coordinator Niki's brief of 2026-10-27 for the G3 item 0 follow-up `derive-workspace-names-from-task-ids` (size S), with the coordinator's decision, not to be reopened: derive branch and directory names by encoding a readable sanitized prefix and a digest of the full identifier, collision-free and deterministic; no restriction of the API and no OpenAPI change; drop the claim that item 9 mints safe identifiers.
- Git workspace contract (`docs/contracts/git-workspace.md`): section 2 derives every workspace and task branch name (prefix rules, SHA-256 digest cut to 32 hexadecimal characters, length, Git ref validity, collision reasoning); the workspace record holds the attempt identifier, from which `list` reports it; sections 3, 4, 9, 12, and 13 drop the name checks and `unsafe-name` and name the new conformance case and double defects; section 14 drops the item 9 obligation.
- `@taskelith/workspace`: `workspaceDirectoryName` and `taskBranchName` derive names and return them directly, `WORKSPACE_NAME_RULES` holds the prefix and digest lengths, a Node-free SHA-256 computes the digest, and `WORKSPACE_FAILURE_REASONS` loses `unsafe-name`. The conformance suite replaces its unsafe-name rows with a name derivation case; the test double derives its names, keeps the attempt identifier in its record, and gains two defects.
- `git-workspace-port` spec: a new requirement for the name derivation, and the layout, prepare refusal, task branch, and conformance suite requirements without the safe-name rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `git-workspace-port`: workspace name derivation; the layout, prepare refusals, task branch, and conformance suite follow it.

## Impact

- The private package `@taskelith/workspace` only; the published `taskelith` package, the OpenAPI and AsyncAPI documents, and the control plane are unchanged. No Git adapter exists yet (G3 item 16), so no deployed workspace has a name to migrate.
