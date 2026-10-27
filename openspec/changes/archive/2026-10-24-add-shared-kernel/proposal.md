## Why

G1 work item 2 ([docs/g1-plan.md](/docs/g1-plan.md)). Architecture section 6 keeps the shared kernel "deliberately small: opaque identifiers, basic error vocabulary, and stable event metadata". The workflow model (item 4), the SDLC framework port (item 6), and task admission (item 7) need these shared types, and the port's typed results need a result shape, which the plan adds to the kernel.

## What Changes

- Add the first workspace package, `@taskelith/kernel` (`packages/kernel`, private, no runtime dependencies), with one public export:
  - opaque identifiers: a branded `Identifier<Kind>` type and a validating `parseIdentifier` constructor;
  - a basic error vocabulary: seven stable `FailureCode` values and a plain, frozen `Failure` value;
  - a typed `Result<T, E = Failure>` shape with `ok` and `err`;
  - stable event metadata: event identity, type, schema version, occurrence time, correlation identity, and optional causation identity, with validating constructors, and an `Instant` type for UTC time.
- Tests in `packages/kernel/test/` that import the package by name, covering every line, branch, and function of the compiled package.

## Capabilities

### New Capabilities
- `shared-kernel`: the content and rules of the shared kernel package.

### Modified Capabilities

## Impact

New private workspace package; the published `taskelith` package and CLI are unchanged, because the root `files` list does not include `packages/`. No runtime or development dependency is added. Depends on G1 item 1, `establish-g1-workspace`, which adds the npm workspace, build, test, coverage, and boundary rules for packages.
