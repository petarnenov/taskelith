# Verification: align-scm-port-with-g2-credentials

## Scope and source

A worker task the coordinator (Niki) assigned on 2026-10-27, developed in a briefed subagent: the G3 item 7 follow-up of the item 0 revalidation (`/docs/g3-plan.md`, items 0 and 7), size M. Source: Niki's brief from item 0 revalidation passes 1 (reviewer A, OpenCode `deepseek-v4-pro`) and 2 (reviewer B, `gpt-6-astra`) by Pepi, with findings H1, M1, H1b, M1b, M2, and L1. Scope: `docs/contracts/source-control.md`, the `scm-port` spec delta, the `docs/g3-plan.md` rows of items 9, 18, 20, and 21 (M1b, coordinator decision option A), and the private `@taskelith/integrations` package (`packages/modules/integrations/`, `"private": true`, so its commits are `chore` and `test`). Out of scope: any delivery path, redaction rule, webhook receiver, or plugin. Design: [design.md](design.md).

## Revision

- Base: `origin/dev` `4fe09456`.
- `032bc2ee` `docs: align the SCM port contract and spec with the G2 credential model` (contract, spec delta, and change records, before the code).
- `29e42d82` `chore(integrations): keep raw payloads out of SCM conformance findings and check identifiers` (code and tests).
- `ae067aa8` `docs: record the align-scm-port-with-g2-credentials verification`.
- `c17c9b5b`: the coordinator merged `origin/dev` `c3e97105` into the branch, without conflicts.
- `bcd49ab3` `docs: assign refreshed SCM credential delivery to G3 items 9, 18, 20, and 21` (M1b).
- `60cc4b80`: the coordinator merged `origin/dev` `bd4382e8` (#357, archive files only) into the branch; reviewer A's pass 1 reviewed this head.
- `b74d1954` `chore(integrations): keep plugin and fixture values out of every SCM conformance finding` (pass 1 findings R1 to R3, with tests).
- A later `docs` commit: the contract and spec for R1, and the pass 1 records (R4, R5).

## Environment

macOS 26.6.2 (Darwin 25.6.0), x86_64, the Intel iMac; Node.js v24.22.1 through `nvm use` from `.nvmrc`.

## Author self-check

- H1, contract section 3 (`docs/contracts/source-control.md:35`) and the added requirement "Run credential secret": G2 has no mechanism; item 20 adds the secret to the redaction of `@taskelith/secrets`, item 21, whose amended plan row owns the delivery to a run, scrubs it on that path (`/docs/g3-plan.md` rows 20 and 21, lines 117 and 118). Checked: `SECRET_SHAPE_RULES` (`packages/modules/observability/src/domain/redaction-rules.ts:88`) has no SCM shape, and a search of `packages/` and `apps/` finds `scrubEnvironment` only in `packages/adapters/secrets/src/` and its test.
- M1, contract sections 1 (`:11`) and 6 (`:73`): items 9, 26, and 37 own the receiver's operation, TLS, and installation; G2 publishes the API on `127.0.0.1` over HTTP (`infra/installation/compose.yaml:70`, `/docs/local-installation.md` lines 28 and 99).
- H1b, contract section 8 (`:98`) and the added requirement "Conformance findings without payloads": `describeThrown` (`packages/modules/integrations/src/ports/untrusted-shapes.ts:127`) at every exception site: `conformance-case.ts:41`, `:87`, `:99`; `conformance-steps.ts:33`; `untrusted-shapes.ts:49`, `:86`, `:108`; the unknown failure code at `untrusted-shapes.ts:100`. The former `describe` is removed (pass 1, R1).
- Pass 1 R1: no finding interpolates a plugin or fixture value; the messages of `credential-cases.ts`, `conformance-steps.ts`, `merge-cases.ts`, and `webhook-cases.ts` name the field and the mismatch, probes name the permission and "the project repository" or "the foreign repository", and a context outside the suite's own is "another required context" (`describeContext`, `conformance-steps.ts:182`). What remains interpolated is the suite's own: operation and step names, the port's constants, the suite's contexts and probe phrases, validated states, and kernel failure codes.
- Pass 1 R2: `fixtureResult` (`conformance-case.ts:104`) reads a fixture `Result` through `readResult`; `attemptBypassMerge` (`merge-cases.ts:150`, `:161`) and `attemptAction` (`credential-cases.ts:194`) use it.
- Pass 1 R3: `abort` throws a frozen object registered in a module-private `WeakSet` (`conformance-case.ts:14`, `:33`), and `isAbortion` (`:48`) checks only `typeof` and `WeakSet.has`, which run no trap of a thrown `Proxy`.
- L1, contract section 2 rule 3 (`:20`) and the modified "Opaque SCM identifiers": `kernelIdentifier` (`untrusted-shapes.ts:21`, kernel `parseIdentifier`), `externalIdentifier` and `externalIdentifiers` (`:33`, `:36`, bound `MAX_EXTERNAL_IDENTIFIER_LENGTH` 1024 at `:25`); `nonEmptyText` (`:14`) reads only the secret. `source-control-readers.ts` uses them for `runId`, `credentialId`, `repositories`, every `repository`, `id`, `headCommit`, `commit`, `changeRequest`, `mergeCommit`, and `deliveryId`.
- M2, contract sections 3 (`:34`) and 7 (`:83`, `:94`) and the modified "Effective permissions": the gate is recorded; `credential-cases.ts:13-14` names it; the suite already reports a `write-code` grant to the change request and status requests (`source-control-results.test.ts`, "an effective grant beyond the request is allowed, but not write-code").
- M1b, coordinator decision (Niki, 2026-10-27) option A: `/docs/g3-plan.md` row 9 (line 106) adds the message for a refreshed per-run SCM credential, row 18 (line 115) its adoption by passing the run's current credential to the item 16 workspace per operation, row 20 (line 117) the port revision that keeps the previous secret until the run confirms adoption, and row 21 (line 118) the delivery, a refreshed credential included, with the secret scrubbed. Contract section 3 (`:38`), section 9 (`:111-112`), and section 10 (`:119`), and the added requirement "Refreshed credential delivery", name them. No "Depends on" entry or wave changed ([design.md](design.md), decision 6).
- Spec delta bodies: "Opaque SCM identifiers" 344 characters, "Effective permissions" 439, "Credential refresh and revocation" 285, "Run credential secret" 296, "Refreshed credential delivery" 352, "Conformance findings without payloads" 313 (190 before pass 1). Each modified requirement copies the current text and keeps its scenarios.
- Plan checklist: [design.md](design.md), section "Plan checklist".

## Checks and results

- Fail-before: the two new test files, `test/source-control-diagnostics.test.ts` and `test/source-control-identifiers.test.ts`, run with `node --experimental-strip-types --test` against the built `src` of `4fe09456`: tests 16, pass 0, fail 16. The diagnostics tests failed because findings held the synthetic secret `scm-secret-7f3a9c`, for example `change request threw: readChangeRequest threw instead of returning a Result: Error: scm-secret-7f3a9c`, `change request fixture: prepareHeadBranch threw: Error: scm-secret-7f3a9c`, `read-only credential threw: the case stopped: Error: scm-secret-7f3a9c`, `... credential could not be read: Error: scm-secret-7f3a9c`, `capabilities could not be read: Error: scm-secret-7f3a9c`, `... readChangeRequest threw instead of returning a Result: {"token":"scm-secret-7f3a9c"}`, `... scm-secret-7f3a9c: x` (an error class named like the secret), `result.error.code scm-secret-7f3a9c is not a kernel failure code`, and `result.error.details` and `result.value could not be read: Error: scm-secret-7f3a9c`. The identifier tests failed because no shape finding was reported for an empty or whitespace `runId`, an empty or 1025-character credential repository, or an empty protection, change request, status, merge, or webhook identifier. After the fail-before run, one assertion with a thrown `Proxy` whose `getPrototypeOf` throws was added to the test "a thrown value that is not an Error is reported without its payload", which had already failed on its first assertion.
- Fail-before for pass 1: seven tests added to `test/source-control-diagnostics.test.ts`, run against the built code of `60cc4b80`: tests 17, pass 10, fail 7; each new test failed on its first assertion. The R1 tests failed because outcome findings held the secret, for example `issueRunCredential returned run scm-secret-7f3a9c, not conformance-read-only`, `issueRunCredential granted ["read-code","scm-secret-7f3a9c"] for ["read-code"]`, `returned expiresAt scm-secret-7f3a9c, not a canonical future instant`, `readChangeRequest returned repository scm-secret-7f3a9c, not acme/project`, and `setCommitStatus returned context scm-secret-7f3a9c, not taskelith/verification`; the fixture test failed on a `signatureHeader` that held the secret. The R2 test failed on `attemptBypassMerge ... failed with scm-secret-7f3a9c`, and the R3 test failed because the run rejected with `Error: scm-secret-7f3a9c`.
- Results per revision:

| Check | `ae067aa8` | `bcd49ab3` (after merge `c17c9b5b`) | Final tree (after `b74d1954`) |
| --- | --- | --- | --- |
| Integrations tests with coverage (`node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/modules/integrations/dist/**/*.js' packages/modules/integrations/test/*.test.ts`, after `npm run build`) | 77 of 77 pass; 99.22% lines, 97.05% branches, 99.23% functions | the same | 84 of 84 pass; 99.49% lines, 98.04% branches, 99.24% functions |
| `npm run build`; `npm run check:boundaries` | exit 0; `Workspace and hexagonal boundary checks passed.` | the same | the same |
| `npm run verify:comments` | `Every comment is within the comment length rule.` | the same | the same |
| `npm run verify:links` | `Every checked link conforms.` | the same | the same |
| `make findings ARGS="validate"` | 33 findings files, 13 pass summary files valid | 34 and 14 valid | 35 and 15 valid |
| `npm run openspec -- validate align-scm-port-with-g2-credentials --strict` | valid | valid | valid |
| `npm run verify:archive` | `Every active OpenSpec change archives into strictly valid specs.` | the same | the same |

- `make verify` on `60cc4b80`, before pass 1, by the coordinator (Niki's worker session, macOS x86_64 iMac): exit 0, last line `Packed file allowlist and installed CLI verification passed.`
- `make verify` after the pass 1 fixes: pending.

## Independent review

- Pass 1, reviewer A: Codex CLI `gpt-6.1-sol`, effort medium, read-only (from the session header), session `01a17e30-c2d5-7432-a273-61e226b7223f`, run by the coordinator on HEAD `60cc4b80a5c52fc8a6232a8c8359f9cb1f831a92`; the worktree snapshot before and after was equal. The reviewer confirmed 77 of 77 tests and that the 16 tests of `29e42d82` fail on the code of `4fe09456`. Findings: Critical 0, High 2, Medium 2, Low 1, as in `passes.jsonl`; all fixed, unreviewed until pass 2:
  - R1 High (redaction, `credential-cases.ts:100`): outcome findings interpolated plugin and fixture values, so a secret in permissions, an invalid `expiresAt`, `runId`, or repositories reached the report. Fixed in `b74d1954`: fixed field paths and mismatch descriptions; the contract (section 8) and "Conformance findings without payloads" now cover every finding, and the earlier limitation about checked values is removed.
  - R2 High (redaction, `merge-cases.ts:152`): `attemptBypassMerge` failure codes were interpolated without validating the fixture's `Result`. Fixed in `b74d1954` with `fixtureResult`.
  - R3 Medium (error-handling, `conformance-case.ts:38`): `instanceof CaseAborted` could run a thrown `Proxy`'s `getPrototypeOf` trap, which rejected the whole run. Fixed in `b74d1954` with the `WeakSet` of aborts.
  - R4 Medium (process, `verification.md:42`): the `make verify` before review was not recorded. Recorded above, with the post-fix run pending.
  - R5 Low (stale-citation, `verification.md:14`): the revision list and the per-revision counts were stale, as were contract citations. The revision list, the results table, and every citation were checked again.
- Pass 2, reviewer B: Claude Code `claude-opus-5-5`, effort high. Not run yet.
- Pass 3, reviewer A: Codex CLI `gpt-6.1-sol`. Not run yet.

## Limitations

- A finding names neither the credential nor the value that differed, so a plugin author must reproduce a mismatch to see it.
- A thrown error of a non-built-in class is reported only as "an Error of another class", which tells the plugin author less than its message did.
- The bound of 1024 characters for external identifiers is the module's choice, not a service limit.

## Remaining gates

- `make verify` after the pass 1 fixes.
- Independent review: reviewer B pass 2 and reviewer A pass 3.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
