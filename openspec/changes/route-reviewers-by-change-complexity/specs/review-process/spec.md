## ADDED Requirements

### Requirement: Review route command
`make findings ARGS="route --change <change> [--json] [--no-shadow]"` SHALL derive the structured features of an active change from its committed state against the merge base of `HEAD` and `origin/dev`, decide with the rule router, consult the shadow router unless `--no-shadow` is given, and write the change's `route.json`. It SHALL exit 1 without writing for an unknown or archived change, an existing `route.json`, uncommitted changes outside the change directory, or no merge base.

#### Scenario: Route written
- **WHEN** a worker runs the command for an active change with a clean working tree
- **THEN** the change's `route.json` holds the features, the rule decision, and the shadow result, and the command prints the tier, its triggers, and both pass plans

#### Scenario: Existing route
- **WHEN** the change already has `route.json`
- **THEN** the command exits 1 and leaves the file unchanged

#### Scenario: Uncommitted work
- **WHEN** a file outside the change directory has uncommitted changes
- **THEN** the command exits 1 and writes nothing

### Requirement: Rule routing floor
The rule router SHALL be deterministic and SHALL recommend the reviewers and effort of passes 1 and 2. Its tier SHALL be `elevated` when a trigger fires (400 or more changed lines, 18 or more changed files, 3 or more capabilities, security, contract, or Docker paths, or size M-L or L) and `standard` otherwise. Its reviewers SHALL stay within the owner's reviewer assignment, `standard` SHALL equal today's configured reviewers and effort, and no tier SHALL go below it.

#### Scenario: Large change
- **WHEN** a change without external facts changes 420 lines in 6 files of one capability
- **THEN** the rule recommends `elevated` with trigger `lines`, pass 1 `codex gpt-6.1-sol#high`, and pass 2 `claude claude-opus-5-5#xhigh`

#### Scenario: Small change with external facts
- **WHEN** a change whose `design.md` has an "External facts" section changes 40 lines and fires no trigger
- **THEN** the rule recommends `standard` with pass 1 `claude claude-fable-5-1#medium` and pass 2 `claude claude-opus-5-5#high`

#### Scenario: Same input, same decision
- **WHEN** the rule router routes the same features twice
- **THEN** both decisions are equal

### Requirement: Shadow routing
The shadow router SHALL send TypeSafe AI's Jev model only the structured features: counts, capability identifiers, booleans, the size, and the capability history figures, never paths, commits, change names, diff or source text, or finding text. Its tier, confidence, probabilities, expected passes, and the pass plans its tier maps to SHALL be recorded beside the rule's and SHALL NOT change the rule's recommendation.

#### Scenario: Disagreement
- **WHEN** the rule decides `standard` and the shadow router answers `elevated` with probability 0.8
- **THEN** `route.json` records both and the rule's pass plans stay the recommendation

#### Scenario: Request content
- **WHEN** the shadow router sends a request
- **THEN** its `state` holds exactly the allowlisted feature keys

### Requirement: Shadow router failure
When the credential is missing, no response arrives within 2 seconds, the connection fails, the HTTP status is not 2xx, or the response is invalid, the rule SHALL route alone, the command SHALL exit 0, and `route.json` SHALL record the failure as one of `missing-credential`, `timeout`, `network`, `rate-limited`, `overloaded`, `http-error`, or `invalid-response`, with the HTTP status where there is one. The shadow router SHALL NOT retry within the 2 seconds.

#### Scenario: Timeout
- **WHEN** the shadow endpoint does not answer within 2 seconds
- **THEN** the request is aborted, `route.json` records `timeout`, and the rule's pass plans stand

#### Scenario: Invalid answer
- **WHEN** the endpoint answers 200 with a probability above 1
- **THEN** `route.json` records `invalid-response` and no part of the body

#### Scenario: Rate limit
- **WHEN** the endpoint answers 429
- **THEN** `route.json` records `rate-limited` with `httpStatus` 429

### Requirement: Router credential
The shadow router's credential SHALL be read only from the environment variable `JEV_MAF_LAB`, by name. Its value SHALL NOT appear in any output, error, log, or record, and failures SHALL be reported by reason code only, without messages, bodies, or headers.

#### Scenario: Sentinel credential
- **WHEN** `JEV_MAF_LAB` holds a sentinel value and each failure path is exercised
- **THEN** no stdout, stderr, thrown error, or `route.json` contains the sentinel

#### Scenario: Unset credential
- **WHEN** `JEV_MAF_LAB` is unset
- **THEN** no request is sent and `route.json` records `missing-credential`

### Requirement: Route record
`route.json` SHALL conform to `docs/review-findings/route.schema.json`, which rejects unknown properties and free text. `make findings ARGS="validate"` SHALL check every `route.json`, active and archived, against the schema, its change name, and the secret-like value check, and SHALL check that the rule's tier is `elevated` exactly when triggers fired and that its pass plans equal the reviewer table for its tier. `route.json` SHALL be optional.

#### Scenario: Inconsistent tier
- **WHEN** a `route.json` has tier `standard` and trigger `lines`
- **THEN** validation reports the file and fails

#### Scenario: No route
- **WHEN** an active change has no `route.json`
- **THEN** validation does not report it

### Requirement: Route effect
`make findings ARGS="effect [--json]"` SHALL report, per archived change with `route.json`, the rule and shadow tiers, the reviewers that ran passes 1 and 2, the passes needed, and the findings by pass and severity, and in aggregate the agreement of the two tiers and, per router, the third pass share per tier. Changes whose shadow failed or was skipped SHALL be excluded from the shadow figures. A review ended after pass 2 by the conditional third pass SHALL count two passes.

#### Scenario: Third pass share per tier
- **WHEN** two archived changes routed `elevated` needed 3 and 2 passes
- **THEN** the effect reports a third pass share of 50% for the rule's `elevated` tier

#### Scenario: Failed shadow
- **WHEN** an archived change's `route.json` records `timeout`
- **THEN** the change counts in the rule figures and not in the shadow figures

#### Scenario: No third pass after record-only fixes
- **WHEN** an archived change's pass 2 fixes were recorded as `fixed-unreviewed` and no pass 3 ran
- **THEN** the effect counts two passes needed and no third pass for it

### Requirement: Archive routing evaluation
`make findings ARGS="route-evaluation --save <change>"` SHALL route each archived single-artifact change with review records by both routers using only information from before its review: the diff of its first reviewed revision, or its merged diff marked approximate, and the capability history of changes merged before its base. It SHALL write one line per change with the outcome, SHALL report changes without `passes.jsonl` apart as lower bounds, and `--rule-only` SHALL skip the shadow router.

#### Scenario: No future history
- **WHEN** the evaluation routes a change merged before a later change of the same capability
- **THEN** the later change does not count in its capability history

#### Scenario: Missing credential
- **WHEN** `JEV_MAF_LAB` is unset and `--rule-only` is not given
- **THEN** the command exits 1 and writes nothing
