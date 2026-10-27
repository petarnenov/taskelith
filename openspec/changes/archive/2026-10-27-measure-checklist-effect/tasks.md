## 1. Contract

- [x] 1.1 Write the `review-process` and `agent-task-protocol` deltas and `docs/review-findings/checklist.schema.json`.

## 2. Tests

- [x] 2.1 Add `test/checklist-record.test.ts` and `test/checklist-effect.test.ts` with hand-computed fixtures, adapt the `test/findings.test.ts` fixture helper, and check that they fail on the pre-implementation commit.

## 3. Implementation

- [x] 3.1 Add `scripts/checklist-record.ts`, `scripts/checklist-effect.ts`, `scripts/checklist-commands.ts`, and `scripts/checklist-environment.ts`.
- [x] 3.2 Dispatch `checklist --json`, `checklist --save`, and `effect` and hook the checklist validation into `scripts/findings.ts`.

## 4. Documentation

- [x] 4.1 Update `docs/agent-task-protocol.md` worker step 2, coordinator step 1, and "Review findings record", the `taskelith-task-protocol` skill, and the `Makefile` comment of `findings`.
- [x] 4.2 Coordinator scope addition: update the `taskelith-coordinator` skill's brief paragraph; check the `taskelith-worker` skill, which needs no change.

## 5. Verify

- [x] 5.1 Save this change's `checklist.json` with the new command and create its empty `findings.jsonl` and `passes.jsonl`.
- [x] 5.2 Run `npm run openspec -- validate measure-checklist-effect --strict`, `validate --all --strict`, `make findings ARGS="validate"`, `make findings ARGS="effect"`, and `make verify`.
- [x] 5.3 Independent review: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed.
  - [x] 5.3.1 Pass 1 by reviewer A, and its fixes with fail-before tests: `--at`, the landing rule, record consistency, the reserved `archive` name, and the `Makefile` comment.
  - [x] 5.3.2 Pass 2 by reviewer B, and its fixes with fail-before tests: dev commit ranking, shallow clones, unreadable snapshots, directory lookup in the effect, the brief duties in the spec, and record corrections.
  - [x] 5.3.3 Pass 3 by reviewer A, Low only: tests for unreadable archives and a hook's `GIT_DIR`, fixed without another pass.
- [x] 5.4 Archive the change.
