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

Pending.

## Remaining gates

Integration into `dev` and the archive.
