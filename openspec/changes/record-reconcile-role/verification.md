# Verification: record-reconcile-role

## Scope and source

Started on 2026-10-25 by the UI worker (Desi) on the coordinator's (Niki) assignment, to be handed back to Niki. Base revision: `1fa5851` on `dev`. Prepared in the git worktree `../taskelith-worktrees/record-reconcile-role` on branch `record-reconcile-role`. Scope: one row of `docs/trust-model.md` section 3, one paragraph of `docs/ui-poc/README.md`, and this change. Source: the owner's decision of 2026-10-25, relayed by the coordinator, that `project-maintainer` may reconcile an attempt in an uncertain state and that the decision is audited. Documentation only, so `.openspec.yaml` sets `skip_specs: true`.

## Author self-check before review

- The new capability matches the reconciliation that `docs/contracts/capacity-reservation.md` and the `execution-model` requirement "Operator reconciliation of an execution" define (an audited decision with evidence that ends an uncertain execution and releases its capacity), and the proof of concept's role map in `docs/ui-poc/src/store.tsx`.
- The README's roles bullet already listed reconciliation under `project-maintainer`; only the open question changed.
- Evidence check: one relative link to the trust model, no external link.

## Checks

Environment: macOS 26 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`; `make verify` pins the same Node through `scripts/with-pinned-node.sh`. Before pass 1: `npm run openspec -- validate record-reconcile-role --strict` passed; `make verify` passed (strict OpenSpec validation 52 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Pending.

## Limitations

None.

## Remaining gates

- Coordinator integration into `dev` and archive.
