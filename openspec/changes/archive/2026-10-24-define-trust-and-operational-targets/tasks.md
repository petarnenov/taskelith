## 1. Contracts and boundary enforcement

- [x] 1.1 Define the G0 identity, enrollment, role authorization, trusted-host, and plugin trust contract in `docs/trust-model.md`.
- [x] 1.2 Define provisional operational targets, resource budgets, retention horizons, and RPO/RTO baselines in `docs/operational-targets.md`.
- [x] 1.3 Add `tsconfig.check.json` and `scripts/check-boundaries.ts` with unit tests in `test/check-boundaries.test.ts`, and wire `check:boundaries` into `package.json` and `.github/workflows/release.yml`.
- [x] 1.4 Update `docs/foundation.md`, `docs/architecture.md`, and `README.md` to reference the new contracts and checks.

## 2. Verification and independent review

- [x] 2.1 Run `npm test`, `npm run check:boundaries`, `npm run verify:dependencies`, strict OpenSpec validation, and `npm run verify:package` under the exact CI Node/npm versions.
- [x] 2.2 Run independent Codex review (`gpt-6.1-sol`, `effort: medium`), resolve any findings, and record verification evidence.
