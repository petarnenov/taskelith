## Why

A review of the Mantine UI proof of concept against the implemented backend, done on 2026-10-25 at the owner's request, found two records that disagree with the code and the contracts. The owner asked for both to be fixed.

## What Changes

- `docs/g3-plan.md`: the starting point listed only three of the trust contract's four roles. It now names `project-viewer` as well (`docs/trust-model.md` section 3).
- `docs/sdlc-framework-mapping.md`: the dated stage table places OpenSpec `tasks.md` under "Implement" and calls SpecKit's "Propose and inspect" a gap, while the frozen port's stage graphs put `tasks` under specification and give SpecKit's `specify` the intake obligation. A dated note under the table states the differences and names the OpenSpec plugin's stage graph and the SpecKit mapping fixture as authoritative; the historical table stays as it was observed.

## Capabilities

### New Capabilities

### Modified Capabilities

None. Both are documentation corrections under existing requirements, so the change sets `skip_specs: true`.

## Impact

Documentation only. No code, contract, or plan item changes.
