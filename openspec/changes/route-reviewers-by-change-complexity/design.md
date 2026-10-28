# Design: route reviewers by change complexity

## Context

Source: the owner's idea of 2026-10-28, with the plan agreed with the coordinator and relayed in the coordinator's brief: a deterministic rule router as the permanent floor, a Jev adapter in shadow mode only, a hexagonal port `ReviewRouter`, the command `make findings ARGS="route --change <name>"`, and the measurement through `effect` and a one-time offline evaluation. Size M. Base revision `3f23516a` on `dev`.

Phase 1, this design, covers research, design, and the contract (spec deltas and `docs/review-findings/route.schema.json`). Phase 2 implements and tests the modules without touching `scripts/findings.ts`, `docs/governance.md`, or `docs/agent-task-protocol.md`, because `adopt-process-performance-recommendations` (governance version 6, a conditional pass 3, `make record`) edits them and lands on `dev` first. Phase 3, after that merge, wires the command and edits the two documents ("Planned edits").

Dependency: the reviewer assignment table of 2026-10-27 and `scripts/reviewer-keys.ts` (canonical reviewer keys) came from the change `normalize-reviewer-keys`, which reached `dev` through pull request #377 (`92516221`) and was merged into this branch before phase 2 (`975e28c0`). The rule table below follows that table, and its pass plans use those canonical keys.

## Review checklist

The brief's invocation, saved as `checklist.json` with `make findings ARGS="checklist --capability review-process,agent-task-protocol --files scripts/** --save route-reviewers-by-change-complexity --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16 --size M"`:

```text
Review checklist (capabilities review-process, agent-task-protocol; files scripts/**), most frequent finding categories first:
1. contract-drift (19): Code, a contract document, and its specification disagree. Example: "The missedBy order diagnostic omitted the finding's artifact, although the protocol says messages name it"
2. error-handling (12): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The Linux crash windows script mounted the services secrets without checking that their variable is set"
3. docs (6): Documentation is missing, wrong, or out of date with the change. Example: "The protocol and the statistics requirement did not mention misses that name a pass without a record"
4. redaction (5): A secret or private value can leak into output, logs, or records. Example: "The NATS seed pattern misses server, cluster, and curve seeds"
5. missing-fail-before-test (3): A fix has no test that fails before it and passes after it. Example: "The scrubbing of inherited GIT_* variables in the git adapter had no targeted regression test"
6. naming (3): A name hides intent or uses two terms for one concept. Example: "Pass summaries were parsed from a type named for findings, and the valid-output helper called its changes files"
7. process (3): A protocol, governance, or review rule was not followed. Example: "The findings operations have no Makefile entry"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (61): A recorded result, count, or claim differs from what the checks show. Example: "The design said four quoting errors never started the CLI, though the CLI started and rejected their arguments"
2. docs (46): Documentation is missing, wrong, or out of date with the change. Example: "The proposal said no other file changes and no other tracked file documents the invocation, though the change adds OpenSpec records and archived records quote the old invocation"
3. spec-wording (29): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Second Claude Code slot ends with "no rotation across Claude accounts can arise", which is untestable and goes beyond section 7.1"
4. stale-citation (23): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (11): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (9): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"

Dev commit: 3f23516a2e4ef8724f38e5c9c67267225f40ff16.
```

How the design answers each review category:

- **contract-drift.** One source per fact: the feature derivations, triggers, and thresholds are constants of one module (`scripts/review-route-rules.ts`), the spec delta and this design name the same values, and a test asserts the table of "Rule table" row by row. `route.schema.json` is the contract of `route.json`; the writer validates its own output against it before writing, so the code cannot write what validation refuses.
- **error-handling.** Every shadow failure maps to one closed reason code ("Failure semantics"); nothing is swallowed silently, and the rule's decision is always written. Failures of the command itself (unknown change, dirty tree, unknown dev commit, existing `route.json`) exit 1 without writing.
- **redaction.** The credential is read once by name and held in a value object whose string form is `[redacted]`; errors carry reason codes, never messages, bodies, or headers ("Secret handling"). `route.json` passes the secret-shaped value check that findings get.
- **docs.** The protocol, governance, the `Makefile` comment, and the skills are planned in "Planned edits" and ticked in phase 3.
- **missing-fail-before-test.** Phase 2 writes the tests first and records that they fail on the pre-implementation commit, as `measure-checklist-effect` did.
- **naming.** One term per concept: *route* (the record and the command), *router* (an adapter of the port), *tier* (`standard`, `elevated`), *features* (the router input), *shadow* (the Jev result). "Effort" is the reviewer's `variant` in the review records.
- **process.** The command has a `Makefile` entry through `make findings`; the worker step is a spec requirement of `agent-task-protocol`.
- **Record quality.** Every number below comes from a command or script named next to it; `verification.md` repeats the commands.

## Archived statistics

Source: a scratch analysis (not committed) over the 52 archived changes with `findings.jsonl` or `passes.jsonl` at `3f23516a`, joined with the diff of each change's pull request merge into `dev` (`git diff <merge>^1 <merge>`, outside `openspec/changes/`). Two changes review several artifacts and are left out, leaving 50. Passes needed is the highest pass number recorded; for the 20 changes without `passes.jsonl` it counts only passes with findings and is a lower bound. A third pass was needed by 16 of 50 changes (32%), mean 1.92 passes. The brief's estimate of about 95 archived changes is not borne out: 226 archived changes exist, of which 52 have review records; 32 have `passes.jsonl`.

`make findings ARGS="reviewers"` at `3f23516a`: by role, reviewer A has 59 passes, 2.73 findings per pass, 44% with at least one Medium or worse finding, and 69 misses that later passes attributed to it; reviewer B has 24 passes, 8.25 findings per pass, 71% with a Medium or worse finding, and no misses. Codex `gpt-6.1-sol#medium` alone has 36 misses in 42 passes. Most third passes therefore follow from what reviewer A misses in pass 1, which is the lever for effort.

`make findings ARGS="effect"` at `3f23516a`: 3 archived changes have `checklist.json`, so sizes are known for three changes only; the size feature therefore rests on the owner's scale, not on data.

Third pass share by feature (50 changes):

| Feature | Group | Changes | Third pass | Mean passes |
| --- | --- | --- | --- | --- |
| Lines changed | under 100 | 20 | 1 (5%) | 1.50 |
| | 100 to 399 | 18 | 7 (39%) | 2.00 |
| | 400 to 899 | 5 | 3 (60%) | 2.20 |
| | 900 and more | 7 | 5 (71%) | 2.71 |
| Files changed | under 5 | 15 | 2 (13%) | 1.67 |
| | 5 to 9 | 17 | 5 (29%) | 1.88 |
| | 10 to 17 | 10 | 4 (40%) | 2.00 |
| | 18 and more | 8 | 5 (63%) | 2.38 |
| Capabilities | at most 1 | 35 | 9 (26%) | 1.80 |
| | 2 | 11 | 5 (45%) | 2.09 |
| | 3 and more | 4 | 2 (50%) | 2.50 |
| Security paths | yes | 6 | 3 (50%) | 2.17 |
| Docker paths | yes | 2 | 1 (50%) | 2.00 |
| Contract paths | yes | 1 | 0 | 1.00 |
| Code | yes | 31 | 12 (39%) | 2.03 |
| Documentation only | yes | 15 | 4 (27%) | 1.80 |
| Capability history, third pass share at least 50% over at least 3 earlier changes | yes | 7 | 2 (29%) | 2.00 |

The capability history was computed without future information, from earlier changes only; it does not separate the groups and is therefore recorded as a feature but is no trigger of rule version 1. The rule of "Rule table" puts 17 changes in `elevated`, of which 9 (53%) needed a third pass, and 33 in `standard`, of which 7 (21%) did; over the 30 changes with `passes.jsonl`, 7 of 11 (64%) against 5 of 19 (26%). These figures are in-sample, because the thresholds were read off the same records, so they overstate the rule's accuracy; "Effect extension" measures it on later changes.

Correction of phase 2: the rule figures above do not apply the `contracts` trigger as "Features" defines it. The scratch analysis counted one contract change, but `docs/contracts/**` matches 18 of the 50 changes. The rule-only offline evaluation applies the rule as implemented and gives 27 `elevated` changes, of which 13 (48%) needed a third pass, and 23 `standard`, of which 3 (13%) did; without the `contracts` trigger the same features give 9 of 15 and 7 of 35. `verification.md` records the run and the comparison; the rule is unchanged ("Decisions" 8).

## Features

The features are the router input and the only data that leaves the machine. All are derived from committed state; the command refuses a working tree with changes outside the change directory, so that `route.json` names the commit it describes.

| Feature | Type | Derivation |
| --- | --- | --- |
| `devCommit` | SHA | `git merge-base HEAD origin/dev`, as `checklist` uses. Recorded, not sent. |
| `headCommit` | SHA | `git rev-parse HEAD`. Recorded, not sent. |
| `linesChanged` | integer | Sum of insertions and deletions of `git diff --numstat --no-renames <devCommit> HEAD -- . ':(exclude)openspec/changes'`; binary files count 0. The same exclusion as `effect`'s lines changed. |
| `filesChanged` | integer | Number of paths in that numstat. |
| `capabilities` | identifiers | Directory names under `openspec/changes/<change>/specs/`, sorted; empty when the change skips specs. |
| `touches.code` | boolean | A changed path matches `src/**`, `scripts/**`, `packages/**/src/**`, or `apps/**/src/**`. |
| `touches.tests` | boolean | A changed path matches `test/**`, `packages/**/test/**`, or `apps/**/test/**`. |
| `touches.contracts` | boolean | A changed path matches `packages/contracts/**`, `docs/contracts/**`, `**/*.openapi.*`, or `**/*.asyncapi.*`. |
| `touches.specs` | boolean | `capabilities` is not empty. |
| `touches.docker` | boolean | A changed path matches `**/Dockerfile`, `**/compose*.yaml`, `**/compose*.yml`, or `infra/**`. |
| `touches.security` | boolean | A segment of a changed path, split at `/`, `.`, `-`, and `_` and compared case-insensitively, is one of `auth`, `authentication`, `authorization`, `credential`, `credentials`, `redact`, `redaction`, `secret`, `secrets`, `seccomp`, `token`, `tokens`, `trust`. |
| `touches.docsOnly` | boolean | Every changed path ends in `.md` or lies under `docs/`, and no other `touches` flag except `specs` is set; true for an empty diff. |
| `externalFacts` | boolean | The change's `design.md` has a line `## External facts`, the section governance "External facts" asks for. Decides reviewer A's network access. |
| `size` | `S`, `S-M`, `M`, `M-L`, `L`, or null | The change's `checklist.json` `size`. |
| `capabilityHistory` | object | Over the archive as of `devCommit` (read through git like `checklist --at`), the archived changes with review records whose spec delta directories or finding capabilities include one of `capabilities`: `changes` (count), `thirdPassShare` (share whose highest pass is 3 or more, null without changes), `mediumOrWorsePerChange` (mean, null without changes). |

Sent to Jev: `linesChanged`, `filesChanged`, `capabilities` (public capability identifiers of this public repository), the `touches` flags, `externalFacts`, `size`, and `capabilityHistory`'s three numbers. Never sent: commits, paths, file names, change names, diff text, source, finding titles or resolutions, and reviewer sessions. A test asserts the request body against an allowlist of exactly these keys.

Path globs use `path.posix.matchesGlob`, as `checklist --files` does. The security segment list is a heuristic; it misses a security change whose paths name none of the words and catches `trust` in a non-security document. It is recorded per change, so the effect can show its misses.

## Rule table

Rule version 1. The tier is `elevated` when any trigger fires, otherwise `standard`. `route.json` lists every fired trigger.

| Trigger | Condition | Justification |
| --- | --- | --- |
| `lines` | `linesChanged` at least 400 | 8 of 12 (67%) needed a third pass, against 8 of 38 (21%) below. |
| `files` | `filesChanged` at least 18 | 5 of 8 (63%). |
| `capabilities` | at least 3 capabilities | 2 of 4 (50%); a delta over three capabilities spreads one review across three contracts. |
| `security` | `touches.security` | 3 of 6 (50%); redaction is a top checklist category. |
| `contracts` | `touches.contracts` | ADR 0004 principle "contract-first": drift is the top checklist category; 1 archived case, so by principle, not data. |
| `docker` | `touches.docker` | 1 of 2 (50%); ADR 0004 principle "Docker"; small sample. |
| `size` | `size` is `M-L` or `L` | The owner's size scale; no archived data yet. |

Reviewers and effort per tier, within the owner's reviewer assignment of 2026-10-27 (A Codex `gpt-6.1-sol`, B Claude Code `claude-opus-5-5` high; A Claude Code `claude-fable-5-1` for tasks that need network access; OpenCode at most B and only for documentation-only tasks):

| Tier | `externalFacts` | Pass 1, reviewer A | Pass 2, reviewer B |
| --- | --- | --- | --- |
| `standard` | false | `codex gpt-6.1-sol#medium` | `claude claude-opus-5-5#high` |
| `standard` | true | `claude claude-fable-5-1#medium` | `claude claude-opus-5-5#high` |
| `elevated` | false | `codex gpt-6.1-sol#high` | `claude claude-opus-5-5#xhigh` |
| `elevated` | true | `claude claude-fable-5-1#high` | `claude claude-opus-5-5#xhigh` |

The keys are the canonical reviewer keys of `normalize-reviewer-keys` (`harness model#variant`). `standard` is exactly today's configuration, so the floor never weakens a review; `elevated` raises effort, chiefly for reviewer A, whose misses cause the third pass. Pass 3 is reviewer A again with pass 1's reviewer and effort. Claude Code accepts `--effort low|medium|high|xhigh|max` (local `claude --help`, Claude Code 2.1.312, 2026-10-28); for Codex, the installed CLI's local model catalog (`~/.codex/models_cache.json`, client 0.163.0, fetched 2026-10-27, read offline in phase 2) lists `low`, `medium`, `high`, `xhigh`, `max`, and `ultra` as the supported reasoning levels of `gpt-6.1-sol`, so `high` is a valid `model_reasoning_effort`. The rule never picks an OpenCode reviewer ("Decisions" 7).

`route.json` is a recommendation only ("Decisions" 1). Authorizing the elevated efforts, `high` for reviewer A and `xhigh` for reviewer B, needs a later governance change that the owner approves; until then the brief's reviewers and today's configured effort apply.

## Port and adapters

Module layout follows the repository's tooling convention: flat modules under `scripts/` next to the findings tool, pure logic separated from I/O as in `checklist-effect.ts` (pure) and `checklist-environment.ts` (git adapter). The router is repository tooling, not product code, so it does not live in `packages/`; `scripts/` is outside the product boundary check and the product coverage gate ("Coverage").

| Module | Role |
| --- | --- |
| `scripts/review-route.ts` | Domain and port: feature, decision, and route types; `ReviewRouter`; tier to reviewer mapping. Pure. |
| `scripts/review-route-rules.ts` | `RuleRouter` adapter: the triggers and thresholds. Pure. |
| `scripts/review-route-jev.ts` | `JevRouter` adapter: request mapping, HTTP call, response parsing, failure codes. |
| `scripts/review-route-features.ts` | The `RouteEnvironment` port and the feature derivation over it. Pure apart from the port. |
| `scripts/review-route-environment.ts` | The git adapter of `RouteEnvironment`: merge base, status, numstat, and file reads at a commit. |
| `scripts/review-route-record.ts` | The `route.json` record: its shape, its validation (schema, change name, secret-like values, consistency), and its printed summary. Pure. |
| `scripts/review-route-command.ts` | `route` command: parse, derive, call both routers, validate, write; `routeDependencies` is the composition root that reads the credential. |
| `scripts/review-route-effect.ts` | The routing figures of `effect` and the offline evaluation. Pure. |
| `scripts/review-route-evaluation.ts` | The offline evaluation. |

```ts
export type Tier = 'standard' | 'elevated';
export type Trigger = 'lines' | 'files' | 'capabilities' | 'security' | 'contracts' | 'docker' | 'size';

export interface RouteFeatures {
  readonly linesChanged: number;
  readonly filesChanged: number;
  readonly capabilities: readonly string[];
  readonly touches: Readonly<Record<'code' | 'tests' | 'contracts' | 'specs' | 'docker' | 'security' | 'docsOnly', boolean>>;
  readonly externalFacts: boolean;
  readonly size: Size | null;
  readonly capabilityHistory: CapabilityHistory;
}

export interface CapabilityHistory {
  readonly changes: number;
  readonly thirdPassShare: number | null;
  readonly mediumOrWorsePerChange: number | null;
}

export interface PassPlan {
  readonly pass: 1 | 2;
  readonly role: 'A' | 'B';
  readonly reviewer: Reviewer; // { harness, model, variant }
}

export interface RouteDecision {
  readonly tier: Tier;
  readonly passes: readonly [PassPlan, PassPlan];
}

export interface RuleDecision extends RouteDecision {
  readonly version: number;
  readonly triggers: readonly Trigger[];
}

export type ShadowFailure =
  | 'missing-credential' | 'timeout' | 'network' | 'rate-limited'
  | 'overloaded' | 'http-error' | 'invalid-response';

export type ShadowDecision =
  | (RouteDecision & {
      readonly status: 'answered';
      readonly model: string;
      readonly confidence: number;
      readonly probabilities: Readonly<Record<Tier, number>>;
      readonly expectedPasses: number;
      readonly latencyMs: number;
    })
  | { readonly status: 'failed'; readonly reason: ShadowFailure; readonly httpStatus?: number; readonly latencyMs: number }
  | { readonly status: 'skipped' };

// The port. The rule adapter never fails; a shadow adapter
// resolves to a failed decision instead of rejecting.
export interface ReviewRouter<Decision> {
  route(features: RouteFeatures): Promise<Decision>;
}
```

- **`RuleRouter implements ReviewRouter<RuleDecision>`.** Pure; resolves synchronously wrapped in a promise; the triggers in a fixed order.
- **`JevRouter implements ReviewRouter<ShadowDecision>`.** Constructed with a `JevSettings` value: `credential: Credential | undefined`, `endpoint` (default `https://api.typesafe.ai/v1/systemone`), `model` (default `jev-1.14.0`, a pinned version, not the alias `jev-latest`, which moves), `timeoutMs` (default 2000), and an injected `fetch` (default the global). Request: `POST`, `Content-Type: application/json`, `Authorization: Bearer <credential>`, body `{ model, state: <the features sent>, questions: { tier: <choice>, passes: <score> } }`. The `tier` question is a `choice` with criteria `standard` and `elevated`, each described in one sentence; the `passes` question is a `score` with the levels "1 pass", "2 passes", "3 passes" (score 0 to 2, so expected passes = score + 1). The Jev tier maps through the same reviewer table to its `passes`, so `route.json` shows what the shadow router would have assigned. No retry: a retry would exceed the 2 s budget.
- **`FakeRouter`** in `test/review-route-fake.ts`: returns a fixed decision or failure, so the command's tests need neither network nor credential.
- **Why no SDK.** The official `@typesafe-ai/sdk` reads `TYPESAFE_API_KEY`, defaults to a 10 s timeout and two retries, and would add a dependency with its transitive tree for one POST; `fetch` and `AbortSignal.timeout` are in Node.js 22+, which the repository already requires. The response is checked by a small hand-written parser of the documented fields, not by the SDK's types.

## Route record

`openspec/changes/<change>/route.json`, one JSON object, defined by `docs/review-findings/route.schema.json` (`urn:taskelith:review-route`), which reuses the finding schema's `change`, `reviewer`, and `identifier` definitions and the checklist schema's `size`. Top level: `change`, `generatedAt`, `devCommit`, `headCommit`, `features`, `rule`, `shadow`. Unknown properties are rejected at every level; numbers are bounded; `shadow.model` is an identifier-like string of at most 80 characters; there is no free-text field, so no response or error text can reach the file.

Validation (`make findings ARGS="validate"`, phase 3): every `route.json`, active and archived, against the schema, its directory's change name, the secret-shaped value check, and consistency: `rule.tier` is `elevated` exactly when `rule.triggers` is not empty, `rule.passes` equals the reviewer table of `rule.version` for the tier and `features.externalFacts`, an answered shadow's `passes` equal that table for the shadow's tier, and an answered shadow's probabilities lie in [0, 1]. The reviewer table is kept per rule version (`REVIEWER_TABLES` in `scripts/review-route.ts`): a change of the table, of a reviewer, a model, or an effort, bumps `RULE_VERSION` and adds a table, and the older tables stay, so archived records keep validating against the table they were routed with; a `rule.version` without a table is reported. `route.json` is optional: changes opened before this change lands, archived ones, and a change that has not yet reached its first pass have none. The command refuses to overwrite one, like `checklist --save`; a deliberate re-route deletes the file and records why in `verification.md`.

## Failure semantics

| Situation | Behavior | Recorded |
| --- | --- | --- |
| `JEV_MAF_LAB` unset or empty | No request. | `shadow.status` `failed`, `reason` `missing-credential` |
| No response within 2 s | Request aborted by `AbortSignal.timeout`. | `timeout` |
| DNS, TLS, or connection error | | `network` |
| HTTP 429 | | `rate-limited`, `httpStatus` 429 |
| HTTP 529 | | `overloaded`, `httpStatus` 529 |
| Other non-2xx, 401 included | Body not read. | `http-error`, `httpStatus` |
| 2xx with a body that is not JSON, lacks `answers.tier` or `answers.passes` of the documented shapes, names an unknown choice, or has a probability or confidence outside [0, 1] | Body discarded. | `invalid-response` |
| Any unexpected exception in the adapter | Caught at the adapter boundary. | `invalid-response` |

In every case the rule decision is written, the command exits 0, and stderr gets one line naming the reason code and that the rule decided alone. The command fails (exit 1, nothing written) only on its own preconditions: an unknown change, an existing `route.json`, a working tree with changes outside the change directory, no merge base with `origin/dev`, or an invalid record of the change (for example `checklist.json`). Usage errors exit 2, as in `findings`; `--change archive` and a name not shaped as a change name, such as a dated archive directory, are usage errors.

## Secret handling

- The command reads `process.env.JEV_MAF_LAB` once, in the composition root, into a `Credential` value object whose `toString`, `toJSON`, and `util.inspect` return `[redacted]`; the adapter takes the raw string from it only to build the header.
- No error message, stack, response body, or header is printed or recorded: the adapter maps failures to the closed codes above. `fetch` errors can hold the URL but not headers; they are still not printed.
- The value is never written to `route.json`, stdout, or stderr; a test sets a sentinel credential and asserts that no output, record, or thrown error contains it, for every failure path.
- `route.json` passes the secret-shaped value check of the findings validation.
- The variable is named only in the documentation, the usage text, and the `missing-credential` hint. The owner sets it; the code never asks for or stores it, and the offline evaluation reads it the same way.

## Command

```text
make findings ARGS="route --change <change> [--json] [--no-shadow]"
```

- Writes `openspec/changes/<change>/route.json` and prints a summary: the tier with its triggers, the two pass plans, and the shadow line, for example `shadow: jev-1.14.0 elevated (0.81), would assign codex gpt-6.1-sol#high, claude claude-opus-5-5#xhigh; agrees with the rule` or `shadow: failed (missing-credential); the rule decided alone`.
- `--json` prints the record instead of the summary; it still writes it.
- `--no-shadow` skips the Jev call and records `shadow.status` `skipped`, for tests and for hosts without network.
- The worker runs it once the implementation is committed, before the `make verify` run that `make record` records for review pass 1 ("Phase 3 reconciliation"): the diff features exist only then, while `checklist --save` runs at plan time. Both are pre-review records of the change.

## Effect extension

`make findings ARGS="effect [--json]"` gains a "Routing" section over archived changes with `route.json`:

- Per change: rule tier and triggers, shadow tier and probability of `elevated` or the failure code, the reviewers that actually ran passes 1 and 2 (from `passes.jsonl`), whether they match the route, passes needed (highest pass), pass-1 and pass-2 findings by severity, and whether a third pass ran.
- Aggregate: agreement between rule and shadow tiers (share and Cohen's kappa); per router, a two-by-two table of tier against third pass needed, with the third pass share per tier; the shadow's Brier score of P(`elevated`) and the mean absolute error of its expected passes against passes needed; and the share of changes whose actual reviewers followed the route.
- Changes without `route.json`, or with a failed shadow, are listed and excluded from the shadow figures; the rule figures include every change with `route.json`.
- Phase 2 implements the aggregate as `routingFigures` in `scripts/review-route-effect.ts`, which the offline evaluation shares: per router and tier the changes, third passes, mean passes, pass-1 findings, and Medium or worse findings of passes 1 and 2; the agreement share and Cohen's kappa; the Brier score; the mean absolute error of passes; and the failure counts. Loading `route.json` and `passes.jsonl` into per-change rows, the reviewers that followed the route, and the `effect` output wait for phase 3, because they live in `scripts/findings.ts`.

## Offline evaluation

A one-time measurement of the shadow router over the archived review records, run live only after the owner confirms the items of "Owner actions" and sets `JEV_MAF_LAB` ("Decisions" 6):

```text
make findings ARGS="route-evaluation [--at <revision>] [--rule-only] [--save <change>] [--json]"
```

`runRouteEvaluation` in `scripts/review-route-evaluation.ts` is the entry that phase 3 dispatches from `scripts/findings.ts`; `routeEvaluationDependencies` is its composition root, the only reader of the credential. `--at` names the dev commit whose archive is evaluated, by default the merge base of `HEAD` and `origin/dev`; the recorded run uses `3f23516a`, the base revision, so that its population is that of "Archived statistics".

- Population: the archived single-artifact changes with review records whose merge into `dev` is a pull request merge (50 at `3f23516a`), in merge order. Outcome: passes needed and whether a third pass ran; the 20 changes without `passes.jsonl` are reported apart, because their pass count is a lower bound.
- No future information. Features use the state at the change's own time: the diff of the revision named by the branch's first "pass 1" commit, the parent of the earliest branch commit whose subject names "pass 1", against its merge base with dev, and otherwise the merged diff (`<merge>^1` to `<merge>`) with `approximate: true`, because review fixes enlarge the merged diff; the capability history reads the archive as of that dev commit, as `route` does, so it holds only changes merged before the change's base and never the change itself. Limitation: a branch whose fixes precede the first commit naming pass 1 is measured after those fixes. Counted at `3f23516a` over the 50 changes, by whether a pass 1 finding's recorded fix commit is a branch commit inside the measured revision: 26 are measured after at least one pass 1 fix, 19 before any (one of them had no pass 1 finding), and 5 cannot be told, because their pass 1 findings record no commit (`verification.md` "Review pass 1"). Jev receives the features and never an outcome, a change name, or a date. The model is pinned (`jev-1.14.0`).
- Calls run sequentially with a 10 s timeout and one retry after 429 or 529, since the evaluation is not on a worker's path; failures are recorded per change with their code. The retry waits a fixed 5 s instead of honoring `retry-after`, because `JevRouter` drops response headers by design ("Secret handling").
- Output: `openspec/changes/route-reviewers-by-change-complexity/evaluation.jsonl`, one line per change with the merge, dev, and reviewed commits, `approximate`, the features, the rule decision, the shadow decision or failure (`skipped` under `--rule-only`), and the outcome (passes needed, third pass, whether `passes.jsonl` exists, and the findings of passes 1 and 2 by severity), validated by `docs/review-findings/route-evaluation.schema.json` and the secret-shaped value check before anything is written; `--save` refuses an existing file. The printed figures, or `--json`, cover all changes, those with pass summaries, and those without as lower bounds, each per router and tier, and the third pass share per lines band; `verification.md` records them, noting that the rule's figures are in-sample.
- Estimated cost: about 600 input tokens per request, about 30,000 for the evaluation, at the published $0.042 per million input tokens, under one cent. Without the credential the command exits 1 with the `missing-credential` hint; `--rule-only` evaluates the rule alone and needs no credential.
- Restriction: TypeSafe's Master Customer Agreement section 2.3 forbids using output to train a model that imitates the service. The evaluation compares, and the rule is never fitted to Jev's answers.

### Live shadow results

The live run of 2026-10-28 (`verification.md` "Live shadow evaluation") answered all 50 changes with `jev-1.14.0`. Jev agrees with rule version 1 on 48 of 50 tiers (kappa 0.92); its `standard` tier needed a third pass in 3 of 21 changes (14%) and its `elevated` tier in 13 of 29 (45%), against 3 of 23 (13%) and 13 of 27 (48%) for the rule. The two disagreements, `require-finding-capability` and `scope-review-passes-by-artifact`, are rule `standard` and Jev `elevated`, and neither needed a third pass. Jev also elevates all 12 changes that the `contracts` trigger alone elevates, of which 4 needed a third pass.

For rule version 2 the shadow suggests no change. It separates third passes no better than the rule, and its agreement says little on its own: the `tier` question's criteria name the rule's own signals (size, breadth, security, contracts, containers), and Jev reads the same features. In particular it gives no evidence for or against the narrower `contracts` trigger of "Decisions" 8. Rule version 1 is unchanged; whether to revisit it is the coordinator's decision.

## Coverage

ADR 0004 asks for at least 75% of lines, branches, and functions. `npm test` measures product modules under `dist/`, not `scripts/`. Phase 2 measures the new modules separately with `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/review-route*.ts' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 test/review-route*.test.ts` and records the figures in `verification.md`. The recorded response, `test/fixtures/review-route/jev-systemone-response.json`, was first constructed from the published OpenAPI schema and its documented example shapes; since the live evaluation of 2026-10-28 (task 2.10) it is the body of a captured `jev-1.14.0` response, which holds no credential or identifier and has the same fields as the constructed one, as its `README.md` says. Tests feed it to `JevRouter` through an injected `fetch` and through a local `node:http` server.

## Planned edits

Phase 3, after `adopt-process-performance-recommendations` reaches `dev` and this branch merges `dev`:

- `scripts/findings.ts`: dispatch `route` and `route-evaluation` and list them in `USAGE`; load `route.json` locations next to `checklist.json` in `loadRepository`; validate them in `runCommand` with the route schema; pass the routing rows to `runEffect`. The routing logic stays in the new modules; `findings.ts` only dispatches and validates. As implemented in phase 3, `runFindingsCommand` hands the two asynchronous commands their arguments unparsed, because `runRoute` and `runRouteEvaluation` parse their own options and print their own usage; the other commands keep `parseCommand`. `ajvSchemaCheck`, `SCHEMA_PATH`, and `RunResult` move to `scripts/findings-common.ts`, which `findings.ts` re-exports, so that the routing modules no longer import `findings.ts`, which now imports them. The per-change rows live in `scripts/review-route-report.ts`, and `reviewOutcome` moves to `scripts/review-route-effect.ts`, so that the evaluation and `effect` share it.
- `scripts/checklist-environment.ts`: unchanged. Phase 2 reads the capability history through `archivedReviews` in `scripts/review-route-features.ts` instead.
- `Makefile`: the `findings` target comment names `route`.
- `docs/governance.md`, "Independent review process": under the reviewer assignment, a rule that the brief names reviewers A and B from the table, that `route.json` recommends their effort, that a reviewer A in `route.json` other than the brief's is reported to the coordinator, and that the shadow router decides nothing ("Decisions" 1 and 3). Authorizing `high` for reviewer A and `xhigh` for Claude Code reviewer B under "Authorized reviewers" is a separate governance change that the owner approves; phase 3 proposes it only with that approval. It is reconciled with version 6's conditional pass 3.
- `docs/agent-task-protocol.md`: worker step 4 runs `route` once the implementation is committed and before the `make verify` run recorded for pass 1 ("Decisions" 9); "Review findings record" gains "Route record" and the routing part of "Checklist effect"; the reviewer invocations table shows the effort as `<effort from route.json>`; `JEV_MAF_LAB` is named as the owner-set variable.
- Skills `taskelith-task-protocol` and `taskelith-coordinator`: the same step and the brief's effort.

## External facts

Sources, all accessed on 2026-10-28; each page is an unversioned page. Where the page was fetched with `curl` for exact reading, the SHA-256 prefix of the fetched body is given. No account was created, no terms were accepted, and no API call was made.

| Fact | Source |
| --- | --- |
| TypeSafe AI, Inc. publishes Jev as its first public "System One" model, served by `POST https://api.typesafe.ai/v1/systemone`; `GET /v1/models` lists names. | `https://docs.typesafe.ai/models.md` (unversioned page, `1c56aeadeec0225b`); `https://api.typesafe.ai/openapi.json` (unversioned page, OpenAPI `info.version` 0.2.0, `3ca93b6e6b9aa8d7`) |
| Authentication is HTTP bearer: "Send your API key in the Authorization header as `Bearer <API_KEY>`". | `https://api.typesafe.ai/openapi.json` (`securitySchemes.HTTPBearer`) |
| Request `SystemOneRequest`: required `model`, `state` (string, object, or array), and `questions` (named; types `noul`, `choice`, `score`, `box`); optional `assets`. A `choice` question has 1 to 255 named criteria; a `score` question has 1 to 10 ordered levels starting at zero. | `https://api.typesafe.ai/openapi.json` |
| Response `SystemOneResponse`: `model` (the versioned ID that answered), `answers` keyed by question name, and `usage` (`input_tokens`, `output_tokens`). A choice answer has `choice`, `confidence` (0 to 1), and `probabilities` per choice summing to about 1; a score answer has `score` (probability-weighted level, may be fractional), `confidence`, `legend`, and `probabilities`. | `https://api.typesafe.ai/openapi.json` |
| Models `jev-1.14.0` (from 2026-10-14) and `jev-1.13.0`; aliases `jev-latest` and `jev-preview` point to `jev-1.14.0` and move with releases. Context 64k tokens per request by default. Text input only. | `https://docs.typesafe.ai/models.md` |
| Price: $42 per billion input tokens ($0.042 per million); output tokens free. | `https://docs.typesafe.ai/models.md` |
| Rate limits are per organization in tokens and requests per second, shown in the console; no public numbers. 429 when exceeded; higher limits on custom and enterprise plans. | `https://docs.typesafe.ai/models.md` |
| Status codes 400, 401 (missing or invalid key), 413 (over 32 MiB), 415, 422, 429, 529 (overloaded); retry 429 and 529 with exponential backoff. No documented server timeout. | `https://docs.typesafe.ai/api/errors.md` (unversioned page, `e0465b1d78a056ea`) |
| API keys come from the TypeSafe console (`https://console.typesafe.ai/keys`); the documented variable is `TYPESAFE_API_KEY`. `JEV_MAF_LAB` is not a documented name; it is the owner's choice and works because the adapter sets the header itself. | `https://docs.typesafe.ai/introduction/quickstart.md` (unversioned page) |
| A JavaScript SDK `@typesafe-ai/sdk` exists (Node.js 22 or newer, reads `TYPESAFE_API_KEY`, default timeout 10 s and two retries per its source at tag `v0.7.0`). Not used. | `https://docs.typesafe.ai/sdk/javascript.md` (unversioned page); `https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.7.0/src/retry.ts` (tag `v0.7.0`), reported by the research subagent, not re-read |
| API use is governed by the Master Customer Agreement (last updated 2026-09-23). It is accepted by clicking, by an order, or by "using (or making any payment for) any Services"; access is through an API key (2.4); use consumes "TypeSafe-managed credits" that the customer must obtain (8.2), with possible promotional credits; output may not be used to train a model that imitates the service (2.3(b)). | `https://typesafe.ai/legal/mca` (unversioned page) |
| Customer data: TypeSafe receives a license to use it to provide the services and for abuse monitoring, and "will not" include it in a training dataset without consent (4.1); it has no obligation to retain it and may delete it at any time; telemetry such as logs, hashes, and classifications may be used to improve the services (4.3); a Data Processing Agreement covers retention; zero data retention only for enterprise customers. The privacy policy (last updated 2025-11-19) says "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input." | `https://typesafe.ai/legal/mca`; `https://docs.typesafe.ai/legal.md` (unversioned page, `63060fe526d6d015`); `https://typesafe.ai/legal/privacy-policy` (unversioned page) |
| The website Terms of Use (last updated 2026-09-19) license the website "solely for your personal use" and forbid automated access to the website; they govern the site, not the API, which the MCA governs. The adapter calls only the API. | `https://typesafe.ai/legal/terms` (unversioned page) |

Not found: a free tier, the numbers of the default rate limits, and an API terms page separate from the MCA. Unverified and therefore not designed on: any connection between Jev and the name "MAF Lab".

### Owner actions

Before the shadow router can answer, the owner, not an agent:

1. Has a TypeSafe account and an API key from its console, and sets it as `JEV_MAF_LAB` on the hosts that route. The owner said no account setup is needed; the published docs show no keyless access, so this presumes an existing account and key.
2. Accepts the Master Customer Agreement, which using the key does, on behalf of the owner or an organization.
3. Ensures the account has credits (MCA 8.2); the expected spend is far below one dollar.
4. Consents to sending the structured features of "Features" to TypeSafe, under the retention and telemetry terms above.

## Risks

- **Small sample.** 50 changes, 16 third passes; thresholds are in-sample. Mitigation: the effect measures the rule on later changes; the thresholds are constants that a later change can move with evidence.
- **Confounding.** The two-reviewer rule started on 2026-10-27, so older third passes came from one reviewer; part of the size effect may be policy history.
- **Effort without authorization.** `elevated` effort is not yet in the authorized list; until an owner-approved governance change authorizes it, `route.json` is a recommendation only.
- **Feature leakage of the merged diff** in the offline evaluation (review fixes enlarge it); mitigated by the first-reviewed revision where it can be found and the `approximate` flag where not.
- **Third-party dependency at review time.** A Jev outage or price change cannot block a review: the shadow decides nothing and fails closed to the rule within 2 s.
- **Data leaving the machine.** Only the listed structured features, asserted by an allowlist test; TypeSafe may keep them and their telemetry.
- **Model drift.** A pinned model ID; the effect records the answering model per change.
- **Heuristic security flag.** Misses and false hits are visible per change in `route.json`. A known miss: this change adds a credential adapter (`scripts/review-route-jev.ts`, `JEV_MAF_LAB`), yet its `route.json` records `security: false`, because none of its paths has a listed segment (`jev` and `route` are not). Input to rule version 2: also derive the flag from content or names such as `jev` or `credential` in the diff, or let the brief set it.

## Decisions

The coordinator decided the open questions of phase 1 on 2026-10-28, and decisions 9 and 10 after review pass 1 the same day; the numbers here are this section's own.

1. **Recommendation only.** `route.json` recommends; it binds nothing. Authorizing the elevated efforts (`high` for reviewer A, `xhigh` for reviewer B) needs a later governance change that the owner approves.
2. **When to route.** `route` runs before review pass 1, not at planning time, because the diff features exist only then (former open question 4, option (a)). Amended by decision 9: it runs once the implementation is committed and before the recorded `make verify`, no longer after a passing `make verify`.
3. **Precedence.** The brief names the reviewers and `route.json` sets the effort, within decision 1; a `route.json` whose reviewer A differs from the brief's is reported to the coordinator (former open question 3, option (a)).
4. **No light tier.** No tier lowers an effort below today's configured effort (former open question 2, option (a)).
5. **Evaluation population.** The offline evaluation runs on the 50 archived changes with review records; the 20 of them without `passes.jsonl` are reported separately, as lower bounds.
6. **Owner hard floor.** The TypeSafe account, the acceptance of the Master Customer Agreement, paid credits, and the consent to send the features ("Owner actions") were confirmed by the owner on 2026-10-28, relayed verbatim by the coordinator. Before that confirmation, `JevRouter` is tested only with a fake and the constructed response, no live call is made from any host, and the offline evaluation may be implemented and tested against a fake but is not run live.
7. **No OpenCode reviewer.** The rule never proposes OpenCode, also not as reviewer B of a documentation-only `standard` change, because the coordinator decided that there is no light tier (decision 4) and the router cannot know whether OpenCode's pause has ended (former open question 1, option (a)).
8. **Keep the `contracts` trigger in rule version 1.** The coordinator decided on 2026-10-28 to keep rule version 1 as is. In the rule-only evaluation the trigger matches 18 of the 50 archived changes and alone elevates 12, of which 4 needed a third pass; without it, `elevated` is 9 of 15 and `standard` 7 of 35. The narrower variant (b), the trigger restricted to OpenAPI and AsyncAPI documents, is a candidate for rule version 2, to revisit with Jev shadow data.

9. **Route before the recorded `make verify`** (coordinator, 2026-10-28, option (a) of review pass 1's open item). `route` runs once the implementation is committed, then the `make verify` run that `make record` records, then review pass 1, as the deltas and worker step 4 say; adding `route.json` to the files that `make record-check` ignores was not chosen. This amends decision 2.
10. **Governance version 7** (coordinator, 2026-10-28). A governance rule change bumps the policy version, so "Routed effort" makes `/docs/governance.md` policy version 7, with the history entry "2026-10-28: version 7 adds routed reviewer effort from `route.json`; no elevated effort authorized". The owner requested it with the Jev routing idea of 2026-10-27, assigned as this task, and this coordinator-assigned change implements it; it needs no owner approval beyond that request, because it authorizes no elevated effort, which still needs the owner-approved change of decision 1.

## Phase 2 scope

Phase 2 implements the port, the rule and Jev routers, the fake, the feature derivation and its git adapter, the `route.json` writer and validation, and the composition root with the credential, each tested; the modules are not yet dispatched by `scripts/findings.ts`. Its second step adds the routing figures (`scripts/review-route-effect.ts`), the offline evaluation (`scripts/review-route-evaluation.ts`, its git adapter in `scripts/review-route-environment.ts`, and `route-evaluation.schema.json`), and the rule-only run over the archive. The feature derivation of one revision, `featuresAt`, is shared by `route` and the evaluation. The `effect` per-change rows and the dispatch of `route` and `route-evaluation` wait for phase 3.

## Phase 3 reconciliation

The merge of `dev` at `f3a53f17` (#383, `adopt-process-performance-recommendations`) brought governance version 6 and the generated verification record. Both deltas add requirements only, and `dev` added no requirement of the same name, so no delta rebases on `dev`'s text. Two of them change to fit version 6:

- Order of `route` and `make verify` ("Review route in the task flow"). `make record-check` fails when the tree differs from the verified one outside the change's `verification.md`, `tasks.md`, `findings.jsonl`, and `passes.jsonl`, so a `route.json` committed after the recorded `make verify` would fail it. The worker therefore routes once the implementation is committed and before the `make verify` run that `make record` records for pass 1. This keeps the reason of "Decisions" 2, diff features of the committed implementation, but no longer requires a passing `make verify` before `route`. If that `make verify` fails and its fixes change the diff, the worker deletes `route.json`, routes again, and records why in `verification.md`. The alternative, adding `route.json` to the files that `make record-check` ignores, changes the generated record's requirement; the coordinator chose the order above ("Decisions" 9).
- Conditional third pass ("Route effect"). Pass 3 now runs only when the pass 2 fixes change more than records and documentation, or pass 2 reported a Critical or High finding. A review that ended after pass 2 counts two passes and no third pass; the effect and the evaluation already take the highest recorded pass. The rule still plans passes 1 and 2 only; a pass 3 that runs keeps pass 1's reviewer and effort.

## Open questions

None. The former open question 1 is "Decisions" 7.
