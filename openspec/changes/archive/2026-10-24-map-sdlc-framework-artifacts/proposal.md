## Why

The G1 row of the delivery sequence requires inspecting representative native artifacts and workflows of both OpenSpec and SpecKit before the framework port is frozen (architecture section 13, requirement R34). On 2026-10-24 the owner assigned this inspection as the first G1 preparation task, documentation only.

## What Changes

- Add `docs/sdlc-framework-mapping.md`: for OpenSpec 1.14.3 and SpecKit 1.2.3, the native artifacts and layout, the command surface and validation, a mapping to the platform's lifecycle stages, the gaps and mismatches, and the claims that were not exercised.
- Add the `sdlc-framework-mapping` capability with a requirement for that record.

## Capabilities

### New Capabilities
- `sdlc-framework-mapping`: a pinned, source-cited record of each supported SDLC framework's native artifacts and their mapping to the framework-neutral lifecycle stages.

### Modified Capabilities

None.

## Impact

Documentation only. No code, port design, adapter, dependency, CI, or package impact. SpecKit is neither installed nor added as a dependency.
