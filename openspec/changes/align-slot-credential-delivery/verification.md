# Verification: align-slot-credential-delivery

## Scope and source

A worker task the coordinator (Niki) assigned on 2026-10-27, developed in a briefed subagent: a G3 item 0 follow-up for item 5 (`/docs/g3-plan.md`, items 0 and 5), size M. Source: review B pass 2 of the item 0 revalidation of item 5 (`account-pool-port`), on HEAD `b71f19ff`, findings M5, M6, M7, L6, L7, L8, and L9. Out of scope, owned by other tasks: L3, L4, L5, L10, L11, and M1 to M4 of the same review. Scope: `docs/contracts/account-pool.md`, section 8 of `docs/contracts/installation-and-enrollment.md`, the `account-pool-port` spec delta, and the private packages `@taskelith/kernel`, `@taskelith/observability`, `@taskelith/scheduling`, and `@taskelith/secrets` (each `"private": true`, so their commits are `chore`). No delivery path, add-slot command, or worker code. Design: [design.md](design.md).

## Revision

- Base: `origin/dev` `ea530ede`.
- `9bf1740c` `docs: restrict slot credential delivery to subscription tokens and define its secrecy` (contracts, spec delta, and change records, before the code).
- `787d70a0` `chore(secrets): redact revealed slot credentials by value and keep one REDACTED in the kernel` (code and tests).
- A later `docs` commit adds this record.

## Environment

macOS 26.6.2 (Darwin 25.6.0), x86_64, the Intel iMac; Node.js v24.22.1 through `nvm use` from `.nvmrc`.

## Author self-check

- M5, coordinator decision option (a), by D6 (`/docs/g3-plan.md` line 182): contract sections 3.1 (`docs/contracts/account-pool.md:34`), 6.2 (`:144`), 7 (`:148`), 7.1 (`:152`), and 10 (`:207`), and the added requirement "Subscription token delivery only". `SlotSecret` stays one text; its comment says it is a subscription token (`packages/modules/scheduling/src/domain/slot-secret.ts:3-4`), as does the port's (`packages/modules/scheduling/src/ports/account-pool.ts:20-21`). No claim about provider terms is made; D15 and ADR 0005 decision 2 are pending with the owner.
- M6: rule 5 (`:24`) and section 7.3 (`:160`), the added requirement "Credential kept out of worker records", and the item 18 tests in section 9 (`:196-199`). No delivery or worker code exists, so no test is added here ([design.md](design.md), decision 2).
- M7: rule 5 (`:24`), section 7.4 (`:164`), section 9 (`:194`), `docs/contracts/installation-and-enrollment.md` section 8, and the added requirement "Run redaction by credential value". Code: `revealedValueRules`, `redactSecrets`, and `redactFailure` (`packages/adapters/secrets/src/scrub.ts:19`, `:26`, `:32`). Tests in `packages/adapters/secrets/test/secrets.test.ts` use `q8Rz3vLmN2pXw7Kd`, a token that no shape rule matches, which the first test also asserts.
- L6: section 7.2 (`:156`) and the added requirement "Confidential credential transport".
- L7: section 1 (`:11`, `:12`), section 6.2 (`:142`, `:144`).
- L8: section 6.2 (`:139`), section 7 (`:148`), the modified "Redacted slot credentials", and the port comment (`packages/modules/scheduling/src/ports/account-pool.ts:24`).
- L9: `REDACTED` is defined once, in `packages/kernel/src/redacted.ts:2`, exported from `packages/kernel/src/index.ts:17`, and re-exported by `@taskelith/observability` (`packages/modules/observability/src/domain/redaction-rules.ts:2-4`); `@taskelith/scheduling` imports it and no longer exports it (`packages/modules/scheduling/src/index.ts`).
- Spec delta bodies: "Redacted slot credentials" 415 characters (377 before), "Subscription token delivery only" 344, "Credential kept out of worker records" 406, "Run redaction by credential value" 294, "Confidential credential transport" 180. The modified requirement copies the current text and keeps its three scenarios.
- Plan checklist: [design.md](design.md), section "Plan checklist".

## Checks and results

- Fail-before, with the `src` directories of `@taskelith/kernel`, `@taskelith/observability`, `@taskelith/scheduling`, and `@taskelith/secrets` at `ea530ede` and this change's tests, after `npm run build`, through `node --experimental-strip-types --test`:
  - `packages/adapters/secrets/test/*.test.ts`: tests 11, pass 8, fail 3. "a revealed credential without a known prefix is redacted by value", "a failure of a run is redacted by the value of its credentials", and "a credential inside another and an empty value leave nothing visible" failed with the token unredacted, for example actual `auth q8Rz3vLmN2pXw7Kd failed;xq8Rz3vLmN2pXw7Kdy\nq8Rz3vLmN2pXw7Kd`, expected `auth [redacted] failed;x[redacted]y\n[redacted]`. The linear-time test passed, as expected.
  - `packages/kernel/test/*.test.ts`: tests 18, pass 17, fail 1: `redacted.test.ts` failed with `SyntaxError: The requested module '@taskelith/kernel' does not provide an export named 'REDACTED'`.
  - `packages/modules/scheduling/test/*.test.ts`: tests 87, pass 86, fail 1: `account-pool.test.ts` failed to load with the same `SyntaxError`.
- Fail-before for L9 alone, with only `packages/modules/scheduling/src` at `ea530ede`: `packages/modules/scheduling/test/account-pool.test.ts` tests 34, pass 33, fail 1: "the redaction text is the kernel's, not a second export".
- On `787d70a0`, after `npm run build` (exit 0), each package through `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/<package>/dist/**/*.js' packages/<package>/test/*.test.ts`:

| Package | Tests | Lines | Branches | Functions |
| --- | --- | --- | --- | --- |
| `packages/kernel` | 18 of 18 pass | 100.00% | 100.00% | 100.00% |
| `packages/modules/scheduling` | 120 of 120 pass | 90.18% | 94.56% | 92.27% |
| `packages/adapters/secrets` | 11 of 11 pass | 100.00% | 100.00% | 100.00% |
| `packages/modules/observability` | 23 of 23 pass | 100.00% | 98.73% | 100.00% |

- `npm run check:boundaries` (the type check): `Workspace and hexagonal boundary checks passed.` The repository has no lint script.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run verify:links`: `Every checked link conforms.`
- `make findings ARGS="validate"`: `Every findings file is valid: 36 file(s); every pass summary file is valid: 16 file(s).`
- `npm run openspec -- validate align-slot-credential-delivery --strict`: `Change 'align-slot-credential-delivery' is valid`.
- `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.`
- Archive dry run in a scratch copy of the worktree on `787d70a0`, deleted afterwards: `npm run openspec -- archive align-slot-credential-delivery --yes` (`Totals: + 4, ~ 1, - 0, → 0`), then `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 69 passed, 0 failed (69 items)`; `git diff --stat -- openspec/specs`: only `account-pool-port/spec.md`, 33 insertions and 1 deletion.
- `make verify`: not run; the coordinator runs it.

## Independent review

TBD.

## Remaining gates

- `make verify` by the coordinator.
- Independent review passes 1 (reviewer A), 2 (reviewer B), and, if needed, 3 (reviewer A).
- Device-login delivery, its state directory format, and its compare-and-set write-back: revisit only if item 35 overturns D6.
- The tests of section 9 that items 12 and 18 own: delivery, journal and outbox secrecy, a new delivery after recovery and adoption, and run redaction by value.
- Archive of the change.
- Integration into `dev` by the coordinator (single pull request).
