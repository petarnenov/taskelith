# Verification: record-product-ui-decisions

## Scope and source

The owner's decisions of 2026-10-24, made while reviewing the UI proof of concept, and the owner's request the same day: "1. Нека да може да се избира СДД фреймворк и за тасклит но дефолтно да е опенСпек. … 3. Добави ги в АДР и ОпенСпек" (let the SDLC framework be selectable for Taskelith too, with OpenSpec as the default; add them to an ADR and OpenSpec). Earlier owner statements recorded in ADR 0008 include "ауто мърдж побеждава всичко" (auto-merge wins over everything), the conflict flow with three attempts, automatic worker admission, intake with write-back, and new capabilities as microkernel plugins or adapters. Base revision: `41787eb` on `dev`. Prepared in a git worktree. Scope: ADR 0008 (new); amendments to ADR 0003 and ADR 0004; `docs/governance.md`, `docs/architecture.md`, `docs/foundation.md`, `AGENTS.md`, `README.md`; this change.

## Author self-check before review

- Every rule that conflicted with the decisions now points to ADR 0008: governance authority and lifecycle binding, ADR 0003 decision 11, architecture section 7, and ADR 0004 principle 8. A search for "mandatory OpenSpec", "requires OpenSpec", and "only through OpenSpec" outside archived changes finds no remaining current statement; ADR 0001's dated note and archived changes are historical records and stay unchanged.
- No product code, dependency, or runtime behaviour is added. This repository keeps using OpenSpec.
- The verify-before-review order follows governance's lifecycle table; the conflict flow follows it.
- The UI proof of concept is not stored in the repository and is not cited as evidence.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (tests, coverage thresholds, strict OpenSpec validation 19 passed, package verification). `npm run openspec -- validate record-product-ui-decisions --strict` passed. A script checked every relative link and every `blob/main` repository link with its anchor in the edited documents: 0 missing files or anchors. The edited documents add no external links.

## Independent review

Pending.
