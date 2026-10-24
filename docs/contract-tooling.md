# Contract and schema tooling evaluation

Date: 2026-10-24. Status: evaluation for item 3 of the G1 work plan (`docs/g1-plan.md`, not yet merged when this was written). Documentation only: no tool was installed into the repository, added to `package.json`, or run against a Taskelith contract. Every recommendation below is the **author's proposal**. The owner decides D2 (where contracts live) and D3 (document-first or code-first), and dependency admission follows the [dependency policy](architecture.md#established-open-source-technology-policy). Each proposed tool is recorded as `candidate` in the [dependency register](dependencies.md#contract-tooling).

[ADR 0004](decisions/0004-first-class-engineering-principles.md) principle 6 requires versioned OpenAPI 3.1 documents for HTTP APIs and AsyncAPI documents for NATS messages, TypeScript types, runtime validation, and clients generated from them, and a CI failure on an unversioned breaking change. Principle 5 requires every runnable component to ship as a digest-pinned OCI image, and principle 7 requires `make` targets. Architecture [section 6](architecture.md#6-hexagonal-architecture) requires runtime schema validation of all HTTP, message, and plugin inputs, and [section 9](architecture.md#9-messaging-and-execution-protocol) names the command and event envelope fields.

## Evidence and markers

Package facts (version, publication date, license, Node engine, direct runtime dependencies) come from the npm registry on 2026-10-24. Capability claims cite the upstream README or documentation at the release tag or commit named in [Sources](#sources). Advisory history comes from osv.dev and, for oasdiff, the repository's published advisories; no version named below had a known OSV advisory on 2026-10-24. "Security policy" records the repository's documented route for reporting vulnerabilities at the cited tag, whatever the file name; "private reporting" records whether GitHub private vulnerability reporting is enabled (an unversioned repository setting, observed 2026-10-24).

- **(unverified)** marks a claim about runtime behaviour that comes only from documentation or source and was not exercised. No tool in sections 2 to 7 was run, so each of those sections carries the marker for all of its runtime and capability claims; an inline marker there flags a claim the installing change must test first ([section 10](#10-not-verified-and-remaining-work)). Registry metadata, advisory records, and statements read from a specification are cited facts, not runtime claims.
- Adoption is labeled **verified** when the adopter's `package.json` was read, and **search** when only a GitHub code search result was seen. Neither establishes independent adoption of the exact pinned version.

## 1. JSON Schema dialects and sharing schemas

| Document | Default schema dialect | Other dialects | Source |
| --- | --- | --- | --- |
| OpenAPI 3.1.0 | OpenAPI Schema Object, a superset of JSON Schema 2020-12 (dialect `https://spec.openapis.org/oas/3.1/dialect/base`); `jsonSchemaDialect` sets the document default | A root Schema Object can declare another draft through `$schema`; tooling MUST support the OAS dialect and MAY support others | OpenAPI 3.1.0 lines 147, 195, 2320, 2365 |
| AsyncAPI 3.0.0 | AsyncAPI Schema Object, a superset of JSON Schema draft-07 | Multi Format Schema Object with a `schemaFormat`; the formats table lists JSON Schema draft-07, OpenAPI 3.0 Schema Object, Avro, RAML, Protobuf; JSON Schema 2020-12 is not listed; custom formats are allowed but their implementation is optional | AsyncAPI 3.0.0 lines 1848, 1860, 1875 |
| AsyncAPI 3.1.0 (released 2026-01-31) | Same: superset of draft-07 | Same table; 2020-12 is still not listed | AsyncAPI 3.1.0 lines 1890, 1928 |

A schema shared by the HTTP and the message contracts is therefore read as 2020-12 by OpenAPI tools and as draft-07 by AsyncAPI tools. The two drafts differ in keywords Taskelith could plausibly use: tuple `items`/`prefixItems`, `definitions`/`$defs`, `dependencies`/`dependentRequired`/`dependentSchemas`, `$recursiveRef`/`$dynamicRef`, and `unevaluatedProperties`/`unevaluatedItems`. Ajv cannot use 2020-12 and earlier drafts in the same instance (ajv 8.20.0 `docs/json-schema.md` line 85), so each dialect needs its own validator instance **(unverified)**.

Options for D3 (a):

1. **Common subset.** Shared schemas live in standalone files limited to keywords with the same meaning in draft-07 and 2020-12, without `$schema`; both documents reference them. A `make verify` check compiles each shared file with ajv's draft-07 class and `Ajv2020` and rejects keywords outside the subset.
2. **Separate homes.** HTTP schemas stay 2020-12 inside OpenAPI; message schemas stay draft-07 inside AsyncAPI; nothing is shared, and common shapes such as identifiers are duplicated.
3. **Custom AsyncAPI format.** AsyncAPI payloads declare a custom `schemaFormat` for 2020-12. The AsyncAPI parser would need a custom schema parser, and other AsyncAPI tools may ignore the payloads (the specification makes custom formats optional).

**Proposal:** option 1. It keeps one definition of shared envelope fields (command and event identity, correlation, schema version), uses only the default format of each specification, and makes the restriction a checked rule instead of a convention. The cost is losing `prefixItems`, `$dynamicRef`, and `unevaluated*` in shared schemas; schemas used by only one document keep their full dialect.

## 2. Runtime JSON Schema validator

All runtime and capability claims in this section are **(unverified)**.

| Candidate | Facts | Assessment |
| --- | --- | --- |
| `ajv@8.20.0` with `ajv-formats@3.0.1` | MIT; published 2026-04-24 and 2024-03-30; 4 and 1 direct dependencies; no Node engine declared. `Ajv2020` supports all 2020-12 keywords; the default class supports draft-07. Security policy: `docs/security.md` routes reports to the Tidelift security contact; private reporting off. Past advisories GHSA-v88g-cgmw-v5xw and GHSA-2g4f-4pwh-qvx6 (`$data` ReDoS, fixed in 8.18.0). `ajv-formats`: no security policy found. Adoption: `fastify/ajv-compiler` (verified). Compiles validators with `new Function`, so a strict Content Security Policy needs standalone precompiled validators. | **Proposal: select.** Covers both dialects and supports standalone validator code generation **(unverified)** for the build. Record that reports go through Tidelift rather than GitHub, and ajv-formats' slow maintenance (65 open issues on 2026-10-24). |
| `@hyperjump/json-schema@1.18.0` | MIT; 2026-10-05; 7 dependencies; 2020-12 and OpenAPI 3.0/3.1/3.2 document validation. Adoption: `OAI/Arazzo-Specification`, `temporalio/ui` (search). Asynchronous API, mostly one maintainer. | Alternative if ajv's compliance gaps matter; slower **(unverified)**. |
| `@cfworker/json-schema@4.1.1` | MIT; 2025-01-31; 0 dependencies; no code evaluation; drafts 4, 7, 2019-09, 2020-12. Adoption: `modelcontextprotocol/typescript-sdk` (verified). Last release about 21 months before this evaluation. | Not proposed: release cadence. |
| TypeBox `typebox@1.4.3` compiler | See [section 7](#7-code-first-tooling-for-d3-b). Drafts 3 to 2020-12 per its README. | Only relevant under D3 (b). |

## 3. OpenAPI 3.1 to TypeScript

All runtime and capability claims in this section are **(unverified)**.

| Candidate | Facts | Assessment |
| --- | --- | --- |
| `openapi-typescript@7.13.0` (+ optional client `openapi-fetch@0.17.0`) | MIT; 2026-02-11; 6 dependencies including `@redocly/openapi-core`; peer `typescript@^5.x`; README states OpenAPI 3.0 and 3.1. No security policy found. Output is types only, no runtime code. `openapi-fetch`: MIT; 2026-02-11; 1 dependency. Adoption: supabase `packages/api-types`, `grafana/openapi-to-k6` (search). | **Proposal: select** for types; `openapi-fetch` as the generated-type client for the SPA and external clients. The `typescript@^5.x` peer blocks a TypeScript 7 upgrade until upstream widens it. |
| `@hey-api/openapi-ts@0.99.0` | MIT; 2026-06-22; Node `>=22.18.0`; 10 dependencies; pre-1.0; private reporting on. No README statement of 3.1 support (only `packages/shared/src/openApi/3.1.x` in source). Past advisory GHSA-hhx9-57xq-r5rw. | Runner-up; pre-1.0 on a critical path. |
| `orval@8.44.0` | MIT; 2026-10-21; Node `>=22.18.0`; 25 dependencies; README states only "OpenAPI v3"; 12 OSV advisories in its history, including code-generation remote code execution (GHSA-2h9g-j24r-h63g). | **Reject**: advisory history in the generator path. |

Request and response validators come from the same document: the build extracts each operation's schemas and compiles them with ajv (`Ajv2020`). No mature generator was found that emits both types and ajv validators from OpenAPI 3.1; a small build script owned by the contracts package is expected **(unverified)**.

## 4. JSON Schema to TypeScript and AsyncAPI parsing

All runtime and capability claims in this section are **(unverified)**.

| Candidate | Facts | Assessment |
| --- | --- | --- |
| `json-schema-to-typescript@16.0.0` | MIT; 2026-08-28; Node `>=16.0.0`; 8 dependencies (including prettier and lodash); no git tag for 16.0.0 (npm `gitHead` `7f72770eb854328c96b112be445da0306bebdbaf`). Partial 2020-12: `$defs` supported; `prefixItems`, `unevaluated*`, `dependentSchemas` absent from source. Adoption: `mdn/browser-compat-data` (verified). No security policy found. | **Proposal: select** for AsyncAPI payload schemas and plugin manifests; its supported subset matches the common subset of [section 1](#1-json-schema-dialects-and-sharing-schemas). |
| `@asyncapi/parser@3.6.6` | Apache-2.0; 2026-10-16; 18 dependencies; parses and validates AsyncAPI 2.x and 3.x. Depends on `@asyncapi/specs@^6.11.1`, whose 6.11.1 tarball ships `schemas/3.1.0.json`; parsing a 3.1.0 document was not exercised **(unverified)**. Organization security policy (`asyncapi/.github`), private reporting on. History: MAL-2025-190640 (Shai-Hulud 2.0 worm, November 2025). Adoption: swagger-editor, eventcatalog, springwolf (search). | **Proposal: select** to validate AsyncAPI documents and extract dereferenced payload schemas for type and validator generation. Pin exactly, check lockfile integrity, and review provenance on every upgrade because of the malware history. |
| `@asyncapi/modelina@5.10.1` | Apache-2.0; 2025-10-19; 10 dependencies; AsyncAPI 2.0.0 to 3.0.0. History: MAL-2025-190638, GHSA-4jg2-84c2-pj95. No release in 12 months. | Not proposed: generates classes rather than plain types, stale, advisory history. |

## 5. Document linting

All runtime and capability claims in this section are **(unverified)**.

| Candidate | Facts | Assessment |
| --- | --- | --- |
| `@redocly/cli@2.71.0` | MIT; 2026-10-23; Node `>=22.12.0 \|\| >=20.19.0 <21.0.0`; 0 declared dependencies (bundled, about 14 MB); lints OpenAPI 3.x and 2.0, AsyncAPI 3.x and 2.6, Arazzo. No security policy found, private reporting off. Past advisory GHSA-657c-g7qc-r9j2. Adoption: `elastic/elasticsearch-specification`, `digitalocean/openapi` (verified). Has no breaking-change command. | **Proposal: select** as the one linter for both document types; AsyncAPI 3 rule depth is **(unverified)**. Telemetry and network behaviour need the egress test the dependency policy requires. |
| `@stoplight/spectral-cli@6.17.0` | Apache-2.0; 2026-10-01; Node `^22.0 \|\| >= 24.0`; 20 dependencies; OpenAPI 3.0/3.1/3.2 and AsyncAPI rulesets; private reporting on. Scarf telemetry on by default (`SCARF_NO_ANALYTICS=true` disables it). Adoption: `digitalocean/openapi`, `twilio/twilio-oai` (verified). AsyncAPI 3 rule depth **(unverified)**. | Runner-up. |
| `@asyncapi/cli@6.2.1` | Apache-2.0; 2026-10-12; Node `>=24.0.0`; 42 dependencies; MAL-2025-190653 in its history. | Not proposed: size; `@asyncapi/parser` covers validation. |

## 6. Breaking-change detection

All runtime and capability claims in this section are **(unverified)**.

| Candidate | Facts | Assessment |
| --- | --- | --- |
| oasdiff `v1.34.1` | Apache-2.0; Go, consumed only as a container image; released 2026-10-21. OpenAPI 3.1 support generally available since v1.15.0. `docs/SECURITY.md` describes SSRF through external `$ref`s and the `--allow-external-refs=false` mitigation, not a reporting route; private reporting on. Past advisories: GHSA-2jcc-mxv7-p3f9 (GO-2026-5937; `--allow-external-refs=false` not enforced on the git-revision path, `>=1.13.2, <=1.18.0`) and GHSA-m3wq-w7x2-4q6m (git revision parsed as an option, arbitrary file write, `<=1.26.0`). Image index `tufin/oasdiff:v1.34.1@sha256:67a23cfea7d251e2ae34ee703ac8733c5d96bc2e7b90fd0f4d475ec99367b85f` (linux/amd64 `sha256:b8448ecf…37d5a`, linux/arm64 `sha256:436f72f2…d1bc`), confirmed on Docker Hub on 2026-10-24. No AsyncAPI support. Adoption: elastic/kibana `run_oasdiff.ts` (search). The npm name `oasdiff` is a `0.0.1-security` placeholder: never install it from npm. | **Proposal: select** for OpenAPI, run by digest through a `make` target (`oasdiff breaking --fail-on ERR --allow-external-refs=false` against the merge-base document read from a file, not a git revision), per principles 5 and 7. Consuming a prebuilt Go binary is infrastructure use, not Go product code ([architecture](architecture.md#established-open-source-technology-policy)). |
| `@asyncapi/diff@0.6.0` | Apache-2.0; 2026-10-14; 3 dependencies; no package tag (npm `gitHead` `5c382e16` in the `asyncapi/cli` monorepo); diffs AsyncAPI 2.x and 3.x, rejects cross-major comparisons, needs dereferenced input. History: MAL-2025-190655 (0.5.1 and 0.5.2 were compromised). | **Proposal: select** for AsyncAPI behind a small adapter in the contracts build, fed by `@asyncapi/parser`'s dereferenced output; exact pin, lockfile integrity, provenance review. Classification quality is **(unverified)**. |
| `openapi-diff@0.24.1` (Atlassian) | Apache-2.0; 2025-08-06; Node `>=18`; 9 dependencies; repository on Bitbucket; OpenAPI 3.1 support not stated. | **Reject**: stale, no 3.1 statement. |
| `@useoptic/optic@1.0.9` | MIT; 2025-08-10; no Node engine declared; 66 dependencies; the `opticdev/optic` repository is archived. | **Reject**. |

## 7. Code-first tooling for D3 (b)

All runtime and capability claims in this section are **(unverified)**.

Code-first means schemas are written as TypeScript values and the OpenAPI and AsyncAPI documents are generated from them. It requires an owner exception to ADR 0004 principle 6, which says the document is written and reviewed before the implementation.

| Candidate | Facts | Assessment |
| --- | --- | --- |
| `typebox@1.4.3` | MIT; 2026-10-22 (tag `1.4.3`); 0 dependencies; no Node engine declared. Its README version table states that 1.x targets TypeScript 6.0 to 7.0+ and is ESM only, so it does not fit the current `typescript@5.9.3` pin or the `typescript@^5.x` peer of `openapi-typescript@7.13.0`. Builds JSON Schema values with inferred static types (native 2020-12); includes a JIT validator for drafts 3 to 2020-12 with a fallback for environments that forbid code generation. No security policy found, private reporting on. | Strongest code-first option once the compiler moves to TypeScript 6 or later: its output is plain JSON Schema, so the documents can still be linted and diffed. The OpenAPI and AsyncAPI documents must be assembled by a project script. |
| `@sinclair/typebox@0.34.52` | MIT; 2026-07-11 (tag `0.34.52` in `sinclairzx81/sinclair-typebox`); 0 dependencies. The LTS line for TypeScript 5.0 to 6.0, ESM and CJS; its types target JSON Schema draft-07. | The code-first option compatible with the current compiler pin; its draft-07 output suits AsyncAPI and the common subset of [section 1](#1-json-schema-dialects-and-sharing-schemas). |
| `zod@4.6.7` with `@asteasolutions/zod-to-openapi@9.1.0` | zod: MIT; 2026-10-12; 0 dependencies; security policy (`SECURITY.md`) and private reporting on; past advisories GHSA-m95q-7qp3-xv42 (fixed in 3.22.3) and GHSA-mrhx-c7xc-m3w5 (fixed in 4.6.6, one patch release before the evaluated version); `z.toJSONSchema` targets draft-2020-12 (default), draft-07, draft-04, and OpenAPI 3.0. zod-to-openapi: MIT; 2026-07-19; 1 dependency (`openapi3-ts`), peer `zod@^4.0.0`; `OpenApiGeneratorV31` emits OpenAPI 3.1; no security policy found, private reporting off. | Viable for OpenAPI; AsyncAPI needs draft-07 output assembled by a project script. Validation runs through zod itself rather than the generated schema, so two validation paths exist **(unverified)** in behaviour. |

No maintained code-first generator for AsyncAPI 3 documents was found. Under D3 (b) the linter, oasdiff, `@asyncapi/diff`, and ajv rows above still apply to the generated documents.

## 8. Toolchain per D3 option

| Need | D3 (a) document-first (author's proposal) | D3 (b) code-first |
| --- | --- | --- |
| Source of truth | OpenAPI 3.1 and AsyncAPI 3 documents, shared schemas in the common subset | TypeBox (`@sinclair/typebox` 0.34 on TypeScript 5, `typebox` 1.x after a compiler upgrade) or zod values in TypeScript |
| Document validity and lint | `@redocly/cli`; `@asyncapi/parser` semantic validation | Same, run on generated documents |
| HTTP types and client | `openapi-typescript`, `openapi-fetch` | Inferred from TypeBox or zod; `openapi-fetch` on the generated document |
| Message and manifest types | `json-schema-to-typescript` on parser-extracted schemas | Inferred |
| Runtime validation | ajv (`Ajv2020` for HTTP, draft-07 class for messages) with `ajv-formats` | TypeBox compiler or zod; ajv remains possible on generated schemas |
| Breaking changes | oasdiff container; `@asyncapi/diff` | Same, on generated documents |
| Owner action | Decide D2 and D3 | Decide D2 and D3, and grant an ADR 0004 principle 6 exception |

All generated output is produced by the build in `make verify` and not committed, under either D2 option (plan D2).

## 9. OpenSpec JSON output for the adapter (D6)

Run with the pinned `@fission-ai/openspec@1.14.3` and `OPENSPEC_TELEMETRY=0` in this change's worktree on 2026-10-24. Every command below printed valid JSON. Failures also printed JSON and exited 1, in two shapes: `show` of a missing change and `instructions` without a usable change printed a `status` array of `{severity, code, message}`; `validate` of an invalid or missing item printed the normal `validate` shape with `valid: false` and `issues` entries of `{level, path, message}`.

| Command | Exit | Top-level keys | Adapter use |
| --- | --- | --- | --- |
| `list --json` | 0 | `changes`, `root` | Enumerate active changes |
| `list --specs --json` | 0 | `specs`, `root` | Enumerate specs |
| `show <spec> --type spec --json` (also `--requirements`) | 0 | `id`, `title`, `overview`, `requirementCount`, `requirements`, `metadata`, `root` | Read spec content and requirements |
| `show <change> --type change --json` | 0 | `id`, `title`, `deltaCount`, `deltas`, `root` | Read a change's deltas |
| `validate <item> --type spec\|change --strict --json`, `validate --all --strict --json` | 0 | `items` (`id`, `type`, `valid`, `issues`, `durationMs`), `summary`, `version` (`"1.0"`), `root` | Structural validation evidence |
| `status --change <change> --json` | 0 | `changeName`, `schemaName`, `planningHome`, `changeRoot`, `artifactPaths`, `isPlanningComplete`, `isComplete`, `applyRequires`, `nextSteps`, `actionContext`, `artifacts`, `root` | Artifact completion and blocking |
| `instructions <artifact> --change <change> --json` | 0 | `changeName`, `artifactId`, `schemaName`, `changeDir`, `planningHome`, `outputPath`, `resolvedOutputPath`, `existingOutputPaths`, `description`, `instruction`, `context`, `template`, `dependencies`, `unlocks`, `root` | Artifact authoring instructions |
| `schemas --json` | 0 | array of schemas | Workflow schema identity |
| `context --json`, `doctor --json` | 0 | `root`, `members`, `status` / `root`, `store`, `references`, `status` | Root resolution and health |

`archive --help` and `new change --help` list a `--json` option; neither was run with it here, because archiving would change the repository, so their JSON output is **(unverified)**. Option D6 (a), spawning the pinned CLI and reading this output, is supported for read and validate operations.

## 10. Not verified and remaining work

- No tool was installed or run against a Taskelith contract; every capability claim is from documentation or source at the cited version.
- AsyncAPI 3.1.0 parsing by `@asyncapi/parser@3.6.6`, AsyncAPI 3 lint depth in Redocly and Spectral, `@asyncapi/diff` classification quality, and ajv standalone code generation for both dialects are unverified.
- The TypeScript compatibility of `typebox@1.4.3` and `@sinclair/typebox@0.34.52` is taken from the TypeBox README and was not compiled against.
- `@hey-api/openapi-ts` and orval OpenAPI 3.1 statements, `openapi-diff` 3.1 support and security policy, and every **search** adopter are unverified.
- Network and telemetry behaviour of each selected CLI needs the egress test the dependency policy requires before admission.
- Item 8 (plugin registration) and item 13 (wire contracts) depend on D2, D3, and this evaluation; they install the selected tools through their own changes.

## Sources

- OpenAPI 3.1.0 specification at tag `3.1.0`: [versions/3.1.0.md](https://github.com/OAI/OpenAPI-Specification/blob/3.1.0/versions/3.1.0.md)
- AsyncAPI specification at tag `v3.0.0`: [spec/asyncapi.md](https://github.com/asyncapi/spec/blob/v3.0.0/spec/asyncapi.md); at tag `v3.1.0`: [spec/asyncapi.md](https://github.com/asyncapi/spec/blob/v3.1.0/spec/asyncapi.md)
- ajv at tag `v8.20.0`: [docs/json-schema.md](https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/json-schema.md), [docs/security.md](https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/security.md)
- ajv-formats at tag `v3.0.1`: [README.md](https://github.com/ajv-validator/ajv-formats/blob/v3.0.1/README.md)
- @hyperjump/json-schema at tag `v1.18.0`: [README.md](https://github.com/hyperjump-io/json-schema/blob/v1.18.0/README.md)
- @cfworker/json-schema at tag `@cfworker/json-schema@4.1.1`: [README.md](https://github.com/cfworker/cfworker/blob/%40cfworker/json-schema%404.1.1/packages/json-schema/README.md)
- openapi-typescript at tag `openapi-typescript@7.13.0`: [README.md](https://github.com/openapi-ts/openapi-typescript/blob/openapi-typescript%407.13.0/packages/openapi-typescript/README.md)
- openapi-fetch at tag `openapi-fetch@0.17.0`: [README.md](https://github.com/openapi-ts/openapi-typescript/blob/openapi-fetch%400.17.0/packages/openapi-fetch/README.md)
- @hey-api/openapi-ts at tag `@hey-api/openapi-ts@0.99.0`: [repository tree](https://github.com/hey-api/openapi-ts/tree/%40hey-api/openapi-ts%400.99.0)
- orval at tag `v8.44.0`: [README.md](https://github.com/orval-labs/orval/blob/v8.44.0/README.md)
- json-schema-to-typescript 16.0.0 at npm `gitHead` commit `7f72770eb854328c96b112be445da0306bebdbaf`: [README.md](https://github.com/bcherny/json-schema-to-typescript/blob/7f72770eb854328c96b112be445da0306bebdbaf/README.md)
- @asyncapi/parser at tag `@asyncapi/parser@3.6.6`: [README.md](https://github.com/asyncapi/parser-js/blob/%40asyncapi/parser%403.6.6/README.md)
- @asyncapi/modelina at tag `v5.10.1`: [README.md](https://github.com/asyncapi/modelina/blob/v5.10.1/README.md)
- @redocly/cli at tag `@redocly/cli@2.71.0`: [README.md](https://github.com/Redocly/redocly-cli/blob/%40redocly/cli%402.71.0/README.md)
- @stoplight/spectral-cli at tag `@stoplight/spectral-cli-6.17.0` (commit `16db1d7fcb17bae89972bd87d3f800e9432af11c`): [README.md](https://github.com/stoplightio/spectral/blob/%40stoplight/spectral-cli-6.17.0/README.md)
- oasdiff at tag `v1.34.1`: [docs/OPENAPI-31.md](https://github.com/oasdiff/oasdiff/blob/v1.34.1/docs/OPENAPI-31.md), [docs/SECURITY.md](https://github.com/oasdiff/oasdiff/blob/v1.34.1/docs/SECURITY.md); advisories [GHSA-2jcc-mxv7-p3f9](https://github.com/oasdiff/oasdiff/security/advisories/GHSA-2jcc-mxv7-p3f9) and [GHSA-m3wq-w7x2-4q6m](https://github.com/oasdiff/oasdiff/security/advisories/GHSA-m3wq-w7x2-4q6m) (unversioned pages)
- @asyncapi/diff at commit `5c382e168801d3762cc0424b794775074a2c6c1d`: [docs/diff/spec.md](https://github.com/asyncapi/cli/blob/5c382e168801d3762cc0424b794775074a2c6c1d/docs/diff/spec.md)
- TypeBox at tag `1.4.3`: [readme.md](https://github.com/sinclairzx81/typebox/blob/1.4.3/readme.md) (version table at line 334); `@sinclair/typebox` at tag `0.34.52`: [readme.md](https://github.com/sinclairzx81/sinclair-typebox/blob/0.34.52/readme.md)
- zod at tag `v4.6.7`: [JSON Schema documentation](https://github.com/colinhacks/zod/blob/v4.6.7/packages/docs/content/json-schema.mdx)
- zod-to-openapi at tag `v9.1.0`: [README.md](https://github.com/asteasolutions/zod-to-openapi/blob/v9.1.0/README.md)
- npm registry metadata for every package version named above, by exact version (`https://registry.npmjs.org/<package>/<version>`), including `openapi-diff@0.24.1` (Bitbucket repository) and `@useoptic/optic@1.0.9`; the archived [opticdev/optic](https://github.com/opticdev/optic) repository (unversioned page).
- Docker Hub tag metadata for `tufin/oasdiff:v1.34.1`; osv.dev queries by package and exact version; GitHub repository settings for private reporting; adopter `package.json` reads and GitHub code search results (unversioned services and pages, observed 2026-10-24).
