## 1. Harness dependency and helpers

- [x] 1.1 Remove the harness's dependency on `@taskelith/sdlc` and move the `Clock` port test to `@taskelith/sdlc`.
- [x] 1.2 Replace the local `value` helpers of the `@taskelith/sdlc` tests, add the development dependency, and regenerate the dependency inventory.
- [x] 1.3 Add the `deterministic-test-harness` delta and the boundary check of the harness manifest.

## 2. Verification and review

- [x] 2.1 Run `make verify` and the OpenSpec strict validation.
- [x] 2.2 Obtain independent review (assigned Claude Fable 5.1 medium by rotation) and record results.
