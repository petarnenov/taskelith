## 1. Capture

- [x] 1.1 Add the Dockerfile, the hash-locked requirements file and its input, the capture script, and the two probe workflows under `tools/speckit/`.
- [x] 1.2 Add the `speckit-image`, `speckit-capture`, and `speckit-lock` targets to the `Makefile`.
- [x] 1.3 Run `make speckit-capture` twice and confirm identical output.

## 2. Records

- [x] 2.1 Write `docs/qualification/speckit.md` with setup, method, captured tree, results, and remaining gates.
- [x] 2.2 Settle the exercised claims in `docs/sdlc-framework-mapping.md`.
- [x] 2.3 Add the "SDLC framework tools" section to `docs/dependencies.md`.
- [x] 2.4 Add the reproducible-capture requirement to the `sdlc-framework-mapping` capability.

## 3. Verification and review

- [x] 3.1 Run `make verify`.
- [x] 3.2 Obtain independent review (Claude Fable 5.1 medium, by rotation; two passes, the second Low-only) and record results.
