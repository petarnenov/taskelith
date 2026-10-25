## Why

On 2026-10-25 the owner decided G3 decision D17: the SPA uses only Mantine. The UI proof of concept that ADR 0008 was decided on is a design canvas with hand-made styles, so it no longer shows what the SPA will look like. At the owner's request the proof of concept was rebuilt with Mantine 9.7.3. The owner then asked to record the Mantine build as the official proof of concept, to make it the basis of G3 item 28 `scaffold-web-spa`, and to mark the old canvas as superseded, and chose to store the source in the repository as reference material.

## What Changes

- Add ADR 0011: the Mantine build is the official proof of concept, the old canvas is superseded, the source is stored in `docs/ui-poc/` as reference material, and item 28 starts from it.
- Add `docs/ui-poc/`: the proof of concept's source, its build script, and a README with the screens, the departures from "only Mantine", the published build, and how to rebuild it outside the workspaces.
- Note the amendment in ADR 0008's status and consequence.
- Name `docs/ui-poc/` and ADR 0011 in item 28 of `docs/g3-plan.md`.
- Add the `product-ui` requirement "Reference proof of concept".

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds the requirement "Reference proof of concept".

## Impact

Documentation and reference source only. `docs/ui-poc/` is not a workspace and has no `package.json` or lockfile, so no dependency is admitted; React, Mantine, and esbuild are evaluated by G3 item 1 before item 28 uses them. No product code, contract, or release is affected.
