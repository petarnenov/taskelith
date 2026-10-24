# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's G1 plan, item 9, run as owner decision D5 (a1); taken by the coordinating session (Niki) under the owner's authorization to start G1 items in dependency order. Base revision: `1bdf5b5` on `dev`. Scope: `tools/speckit/`, the `speckit-image`, `speckit-capture`, and `speckit-lock` targets in the `Makefile`, `docs/qualification/speckit.md`, the captured tree `docs/qualification/speckit-1.2.3/`, the SpecKit sections of `docs/sdlc-framework-mapping.md`, the "SDLC framework tools" section of `docs/dependencies.md`, and this change.

## Evidence

- Environment: macOS x86_64, Docker Desktop server 29.5.2 (`linux/amd64`). Image `taskelith-speckit:1.2.3` built by `make speckit-image` on base `python@sha256:d98cc29d3266e535dd9da1099688d9cb3ca4753813571e071763d17725460962`.
- `make speckit-lock` compiled `tools/speckit/requirements.txt` (41 pins, SHA-256 `25a4786880d379d11c2588afb5751140e5bd1155f33483214528c2b4018f1f39` before review) with uv 0.13.5; pip-tools 7.5.1 failed first with pip 26.2.2, as the capture record states.
- `make speckit-capture` ran with `--network none`. After the pass-1 fixes it was run twice at different times, and `diff -r` between the two outputs found no difference. The transcript records 34 probes: 26 with exit code 0 and 8 with exit code 1, each as the capture record describes.
- An exploration in a scratch image on the same base digest preceded the change; its results were reproduced by the committed capture, not cited separately.
- External facts checked by the author: tag `v1.2.3` of `github/spec-kit` peels to commit `5ea8b1cf0a38699340a38e00d02770308997d8c0` (`git ls-remote`); the spec-kit, uv `0.13.5`, and commit links return HTTP 200; PyPI declares uv 0.13.5 `MIT OR Apache-2.0`, and the classifiers of `markdown-it-py` 4.2.0 and `mdurl` 0.1.2 (MIT) and `pathspec` 1.1.1 (MPL-2.0).

## Author self-check before review

- Every result marked verified cites a probe in `probes.md` or a captured file; the agent steps, the interactive gate path, `--require-spec`, and arm64 stay unverified.
- The capture runs offline, as the invoking user, with the tools mounted read-only; the image installs only hash-checked wheels.
- `make verify`, `package.json`, the lockfile, and the npm package are unchanged.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed before review (tests with coverage, boundary and coverage-scope checks, dependency inventory, strict OpenSpec validation 25 passed, package verification) and again after the pass-1 fixes.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree; the JSON output reports `claude-fable-5-1`. The prompt named AGENTS.md, ADR 0004, the dependency policy, the mapping's evidence rule, and the review process as criteria, and asked for every instance of a problem. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after each pass were equal.

- **Pass 1 — session `1b3d4907-446f-400e-a7f6-2372e1070b6d`.** Findings: 0 Critical, 1 High, 3 Medium, 6 Low. All accepted and resolved:
  1. High: this `verification.md` was missing. Added.
  2. Medium: the mapping marked `--require-spec` as verified, but only `--require-tasks` was run. Now marked unverified in the mapping and the capture record.
  3. Medium: the scaffolding result was not in the transcript, because `specify init` ran outside the probes. `specify init --help` and `specify init` now run as probes.
  4. Medium: three licenses were unnamed, one of them MPL-2.0 (`pathspec`). Named in the capture record and the register, after the author checked PyPI.
  5. Low: the base digest was duplicated in the `Makefile` and the Dockerfile. The Dockerfile now takes it as a build argument.
  6. Low: run-identifier normalization replaced every eight-hex-digit word. The transcript now replaces only the identifiers of the runs that the probes created.
  7. Low: probes with pipes ignored failures before the last command. Probes now run with `bash -o pipefail`.
  8. Low: the target deleted the committed capture before the run. It now writes to a temporary directory and replaces the capture only on success.
  9. Low: the claim that a check rewrites the pointer did not hold for `--paths-only`. A probe now shows that `--paths-only` leaves the pointer unchanged, and the records name the validating mode.
  10. Low: the Dockerfile's `WORKDIR /work` was unused. Removed.
  While fixing, the author also limited the mapping's validation claim to the bash script, the only variant run.

## Remaining gates

Integration (push, pull request into `dev`, merge) and archival; SpecKit's agent steps and the interactive gate path through a qualified harness; an arm64 run; SpecKit's admission evidence (G8).
