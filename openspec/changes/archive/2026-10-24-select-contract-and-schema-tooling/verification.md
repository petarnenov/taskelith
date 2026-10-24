# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's G1 plan, item 3, assigned on 2026-10-24 by the session coordinating G1 (Niki): documentation and dependency register only; no installs and no `package.json` changes. Base revision: `e8aebfb` on `dev`. Scope: the new `docs/contract-tooling.md`, the new "Contract tooling" section of `docs/dependencies.md`, and this change, including the new `contract-tooling` capability.

## Evidence

- A research pass on 2026-10-24 gathered npm registry, osv.dev, and upstream documentation evidence; nothing was installed.
- Author spot-checks the same day: npm version, publication date, license, engine, direct and peer dependencies for every proposed package; the AsyncAPI 3.0.0 schema formats table and Schema Object definition; the OpenAPI 3.1.0 dialect rules (`jsonSchemaDialect`, `$schema`); ajv 8.20.0's statement that 2020-12 and earlier drafts cannot share an instance; the oasdiff `v1.34.1` image index digest and per-platform digests on Docker Hub; TypeBox 1.4.3, zod 4.6.7, and zod-to-openapi 9.1.0 dialect statements, security policies, and private reporting. The spot-check found AsyncAPI 3.1.0 (2026-01-31), which also lists only draft-07, and that `@asyncapi/specs@6.11.1`, required by `@asyncapi/parser@3.6.6`, ships a 3.1.0 schema.
- OpenSpec 1.14.3 JSON commands were run in this worktree with `OPENSPEC_TELEMETRY=0`, including change-scoped `show`, `status`, `instructions`, and `validate`; `archive` and `new change` list `--json` in help but were not run with it.

## Author self-check before review

- Every recommendation is labeled as the author's proposal; D2 and D3 are left to the owner; the code-first option names the ADR 0004 principle 6 exception it needs.
- Every runtime claim not exercised is marked **(unverified)**; adoption is labeled verified or search.
- Every proposed tool has a `candidate` row with exact version, license, engine, upstream, and remaining evidence; oasdiff is a digest-pinned container only (principle 5).
- Evidence check: every external link in both documents returns HTTP 200 and is pinned to a tag or full commit; json-schema-to-typescript 16.0.0 and `@asyncapi/diff` 0.6.0 have no package tag and are pinned to their npm `gitHead` commits. (Before review this line also named Spectral 6.17.0, wrongly; see pass 1.) npm, Docker Hub, and osv.dev are labeled as unversioned services.
- No file outside the three paths above changed; the G1 plan worktree was not edited.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (24 tests passed with 100% line, branch, and function coverage, boundary checks passed, dependency inventory verified, strict OpenSpec validation 18 passed, package verification passed). After the pass-1 fixes, the same run passed again.

## Independent review

Assigned reviewer (rotation): Antigravity CLI with `agy -p <prompt> --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>`, run from the worktree; the log reports model `gemini-4-argon-medium`. The prompt named the ADR 0004 principles, the dependency policy, and the evidence rule as criteria, asked for every instance of a problem, and asked the reviewer to verify external facts with its network access. SHA-256 snapshots of `git ls-files -co --exclude-standard` in the worktree before and after each pass were equal. No external evidence directory was shared with the reviewer.

- **Pass 1 — conversation `2c7e4c81-5286-4fb1-838c-693d0d18641e`.** Findings: 0 Critical, 0 High, 5 Medium, 5 Low. All accepted; the author confirmed each external fact against the upstream source before fixing:
  1. Medium: `typebox@1.4.3` targets TypeScript 6.0 to 7.0+ and is ESM only (README version table), which conflicts with the `typescript@5.9.3` pin and the `openapi-typescript` peer range; `@sinclair/typebox` 0.34 is the TypeScript 5 LTS line, not only an old name. Recorded in the evaluation, the toolchain table, and the register, with a `@sinclair/typebox@0.34.52` candidate row.
  2. Medium: Spectral 6.17.0 has the tag `@stoplight/spectral-cli-6.17.0`; the source now uses it. `@asyncapi/diff` is described as having no package tag.
  3. Medium: ajv's security policy is `docs/security.md` (Tidelift contact), and oasdiff's `docs/SECURITY.md` is SSRF guidance, not a reporting route. The evidence definition now covers any documented route, and both rows were corrected; the oasdiff proposal now names `--allow-external-refs=false` and file inputs.
  4. Medium: most runtime claims in the tool sections lacked the **(unverified)** marker. Sections 2 to 7 now carry it as a whole, the definition and the spec scenario say so, and the ajv instance claim in section 1 is marked.
  5. Medium: sources were missing for ajv-formats, `@cfworker/json-schema`, openapi-fetch, `@hey-api/openapi-ts`, json-schema-to-typescript, openapi-diff, optic, and the adopter and code search observations; openapi-fetch pointed at the openapi-typescript tag. Added, and the openapi-fetch link uses its own tag.
  6–10. Low: MAL-2025-190655 affected 0.5.1 and 0.5.2, and past advisories of ajv, zod, and oasdiff (two, including GHSA-m3wq-w7x2-4q6m from the repository's advisories) were missing; the OpenSpec failure shapes differ between `show`/`instructions` and `validate`; the spec delta did not cover the OpenSpec JSON output (new requirement added); missing npm facts for orval, openapi-diff, and optic, engine spellings, and the register's scope line; task 2.1 was unchecked. All fixed. While checking the zod advisories the author found that GHSA-mrhx-c7xc-m3w5 was fixed in 4.6.6, not in 3.x, and recorded that.

After the fixes, `make verify` passed (see Checks) and every external link was rechecked.

- **Pass 2 — conversation `967acac7-d210-4f13-b576-1966bf371ff7`.** All ten pass-1 findings confirmed resolved; the reviewer rechecked the external facts, link status, and strict validation. Findings: 0 Critical, 0 High, 0 Medium, 0 Low. Remaining findings: 0.

## Remaining gates

Integration by the coordinating session (push, pull request into `dev`, merge); archival; owner decisions D2 and D3; installation and qualification of the selected tools in G1 items 8 and 13.
