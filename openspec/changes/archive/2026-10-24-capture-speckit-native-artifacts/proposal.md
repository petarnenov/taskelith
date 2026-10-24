## Why

The SDLC framework mapping inspected SpecKit 1.2.3 only by reading its source and left its runtime claims marked unverified. G1 item 9 (`capture-speckit-native-artifacts`) must run the pinned SpecKit CLI and workflow engine in a digest-pinned container through a `make` target (owner decision D5 (a1)), settle those claims, capture the scaffolded tree for the mapping fixtures of item 10, and record the exact SpecKit, Python, and uv pins.

## What Changes

- Add `tools/speckit/`: a Dockerfile on a digest-pinned Python base, a hash-locked requirements file and its input, a capture script, and two agent-free probe workflows.
- Add `make speckit-image`, `make speckit-capture` (runs the capture with `--network none`), and `make speckit-lock` (recompiles the lock file with uv).
- Add the captured tree and probe transcript under `docs/qualification/speckit-1.2.3/` and the capture record `docs/qualification/speckit.md`.
- Update `docs/sdlc-framework-mapping.md`: settle the claims the capture exercised and mark them verified.
- Add an "SDLC framework tools" section to `docs/dependencies.md` with SpecKit, its Python dependencies, the base image, and uv as `candidate`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `sdlc-framework-mapping`: adds a reproducible capture of SpecKit's native artifacts and runtime behaviour.

## Impact

Docker is needed only for the new `make` targets; `make verify`, `package.json`, the lockfile, and the npm package are unchanged. No product code changes. SpecKit's agent steps stay unverified until a harness runs them.
