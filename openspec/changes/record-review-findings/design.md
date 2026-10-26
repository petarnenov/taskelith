## Context

Independent review findings live as prose in each change's `verification.md`. The owner asked for a structured, git-tracked record that later briefs can draw on, without a database. Repository scripts are TypeScript run with `node --experimental-strip-types`, and `make verify` runs each `verify:*` npm script.

## Goals / Non-Goals

**Goals:** a bounded line format with a JSON Schema; a controlled vocabulary that grows by one line; validation in `make verify`; an index and a checklist over archived findings; protocol steps that write the record and use the checklist.

**Non-Goals:** a database, an owner-facing UI, backfilling archived changes, the coordinator and worker skills that are not on `dev` yet, and automated extraction of findings from reviewer output.

## Decisions

1. **One `findings.jsonl` per change, next to `verification.md`.** The record moves with the change at the archive, needs no index file that could conflict between parallel branches, and keeps one JSON object per line so that appends from separate passes never touch earlier lines. Alternative: a central file under `docs/`, rejected because every parallel branch would edit it.
2. **Schema and vocabulary in `docs/review-findings/`.** `finding.schema.json` follows the plugin manifest schema's style (JSON Schema 2020-12, `urn:taskelith:` id, `additionalProperties: false`, bounded strings). The category is checked in the schema only by form; membership is checked by the script against `categories.txt`, so the enum exists in one place and a category is one line. Severity and outcome are closed enums in the schema, because the review process fixes them.
3. **Validator: the installed `ajv@8.20.0`.** It is already an exact-pinned runtime dependency of `@taskelith/plugin-sdk` and `@taskelith/contracts` and hoisted to the root `node_modules`; the script imports it the way `scripts/integration-broker.ts` imports `@nats-io/nkeys`, so no dependency is added and the inventory does not change. An adapter (`ajvSchemaCheck`) turns ajv errors into readable messages; the rules see only a `SchemaCheck` function.
4. **Untrusted text.** Each line is at most 4,096 bytes, checked before parsing; strings have maximum lengths and reject control characters; file paths are repository-relative without `..`; unknown properties are rejected. A value or property name shaped like a common token (Taskelith, GitHub, JWT, private key, NATS seed, AWS, Slack, API key) or a URL with credentials fails validation. The patterns are local to the script rather than imported from `@taskelith/secrets`, because that package must be built first and its patterns cover only Taskelith's own secrets.
5. **"Required" without backfill.** Validation requires `findings.jsonl` in every active change and validates it wherever present, but does not require it in archived changes, which predate the record. Worker step 7 checks that a newly archived change has its file, so new archives carry it; `make verify`'s archive dry run moves the file with the change.
6. **Index and checklist read archived findings only.** Archived findings are reviewed and integrated; active ones may still change. Fixed counts `fixed` and `fixed-unreviewed`, declined counts `declined`, and other counts `deferred` and `owner-accepted`; shares are of each group's total. The checklist matches a finding whose capability is one of the given capabilities or whose file matches one of the globs, through Node.js `path.posix.matchesGlob`, available without a warning on the pinned Node.js 24.22.1; with neither option every archived finding matches. It ranks categories by count, then by id, defaults to seven items, allows one to ten, and shows the newest example title, the last one in archive date order. `--json` on `index` costs one line, so it is included.
7. **Pure rules, file access at the edge.** `scripts/review-findings.ts` holds parsing, validation, aggregation, the checklist, and formatting as pure functions; `scripts/findings.ts` holds argument parsing, the ajv adapter, and file access, and returns its output and exit code from `runFindings` so that tests run it on temporary fixtures.

## Risks / Trade-offs

- Branches with active changes created before this change must add an empty `findings.jsonl` when they merge `dev`, or `make verify` fails with a message naming the file.
- Scripts are outside the coverage gate of `npm test`, which measures only built product modules; the tests were measured separately at full line and function coverage.
- The secret patterns are heuristics; they reduce, not exclude, the chance of pasting a secret into the record, and the protocol asks authors to write titles and resolutions in their own words.
- The checklist reflects only archived findings recorded after this change; it starts empty and grows as changes are archived.
