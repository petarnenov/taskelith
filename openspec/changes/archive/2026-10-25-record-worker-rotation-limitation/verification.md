# Verification: record-worker-rotation-limitation

## Scope and source

Pepi reported in the item 20a handoff that no item owns storing a rotated credential generation on the worker. The owner was away and had delegated owner decisions that evening to a Claude Fable 5.1 consul, which chose to defer delivery to G3 item 26 and record the G2 limitation. This is recorded as the delegated decision, not the owner's own; the coordinator reports it to the owner on return. The coordinator developed this change itself, following the worker steps. Base revision: `8b451e3` on `dev`.

## Environment

macOS on arm64, Node.js 24.22.1.

## Author self-check before review

- The three documents agree, and the contract keeps its existing rotation rules.
- The evidence check has nothing to verify: no external link or fact is added.

## Checks

At the committed revision handed to review:

- `npm run openspec -- validate record-worker-rotation-limitation --strict`: passed.
- `make verify`: passed.

## Independent review

Reviewer: Codex CLI, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.

### Pass 1

Session `01a17485-5f95-7971-b4c6-09fb815c617e`, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox. It ran at `fac23ef`, and the SHA-256 snapshots before and after were equal (`2ee03555…1d12`). It confirmed that `skip_specs` is justified.

Findings: Critical 0, High 0, Medium 1, Low 0.

1. Medium, in three places: "rotating a worker means enrolling it again" hid that section 10 refuses enrollment on an existing root, so recovery replaces the worker identity. Fixed: the three places state that the worker cannot adopt a rotated generation, and that recovery is a new identity, a new token and a new root, after the old identity is revoked and its attempts are reconciled.

## Remaining gates

Integration into `dev` and the archive.

### Pass 2

Session `01a17486-571b-7223-ac71-4e8c192c5e49`, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox. It ran at `ba300da`, and the snapshots before and after were equal (`97f491ac…bc6e`). It confirmed the pass 1 fix in all three places and found no problems: Critical 0, High 0, Medium 0, Low 0.
