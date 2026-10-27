## 1. Observation

- [x] 1.1 Read the five item 1 findings (lines 11 to 15 of the revalidation's `findings.jsonl`) and find the rows they name
- [x] 1.2 Re-observe each named fact from the npm registry, the GitHub advisory APIs, and the npm bulk advisory endpoint, with UTC times
- [x] 1.3 Search the docs and active changes for the same stale facts and list the occurrences outside scope

## 2. Correction

- [x] 2.1 Correct the facts in `docs/g3-dependencies.md`, each marked as observed on 2026-10-27
- [x] 2.2 Correct the matching rows of `docs/dependencies.md` "G3 dependencies"
- [x] 2.3 Write `verification.md` with the observation table, the commands, and the checks

## 3. Checks and review

- [x] 3.1 Run `make verify`, `npm run openspec -- validate refresh-g3-dependency-observations --strict`, and `make findings ARGS="validate"`
- [x] 3.2 Review pass 1 by reviewer A (Claude Code `claude-fable-5-1`); record it, its findings, and their resolutions
- [x] 3.3 Review pass 2 by reviewer B (Claude Code `claude-opus-5-5`, effort high), unless pass 1 was Low-only: not run, pass 1 was Low-only
- [x] 3.4 Review pass 3 by reviewer A, if pass 2 needs it: not run, no pass 2

## 4. Review pass 1

- [x] 4.1 Fix the two pass 1 Low findings without another review: the Vitest repository advisory ranges in the observation table and the count of `anthropics/claude-code` advisories that name the npm package

## 5. Archive

- [ ] 5.1 Archive the change and record the archive checks
