## Why

`openspec archive` moves a change directory from `openspec/changes/<change>/` to `openspec/changes/archive/<date>-<change>/` without rewriting its links, so a relative link written for the active location breaks one level short once archived. On `dev` at `bd6108d4`, 331 links in 82 of the 193 archived changes leave their change directory with `../`: 323 are one `../` too shallow and miss their target, 1 links a sibling change that was active when written and has since moved, and 7 resolve. `docs/dependencies.md:126` links a change that has since been archived. No convention or check exists. The owner-delegated decision D+A+B2, relayed by the worker brief on 2026-10-27, sets the rule, the check, and a baseline for the archived links.

## What Changes

- New `scripts/check-record-links.ts`, run as `npm run verify:links` by `make verify` immediately before `npm run verify:archive`. It reads each Markdown file under `openspec/changes/`, `openspec/specs/`, and `docs/` with the GFM lexer of `marked`, added as an exact-pinned development dependency, and checks every inline or reference-style link outside code and raw HTML that has no URI scheme such as `https:` or `mailto:`:
  - the target and any heading anchor exist, with GitHub's heading slugs;
  - no link enters an active change, because that change moves when archived;
  - a relative link in a change record stays inside the change directory, a relative link in a spec delta is rejected, and one in a main spec stays inside its capability directory;
  - an active change is checked at the path that `openspec archive` will give it.
- `scripts/record-links-baseline.tsv` lists the 331 archived links that break the rule, one line per occurrence; the check accepts only those, fails on an entry that no longer occurs, and reports how many remain.
- `docs/dependencies.md:126` links the archived record of `compose-minimal-local-installation-images`.
- Worker step 6 of [the agent task protocol](/docs/agent-task-protocol.md#worker-steps) states the record link rule, and the evidence check of [the review process](/docs/governance.md#independent-review-process) includes it.

## Capabilities

### New Capabilities

### Modified Capabilities

- `integration-flow`: adds the record link check to `make verify` and its baseline.
- `agent-task-protocol`: adds the record link rule.
- `review-process`: the evidence check before the first pass includes the record links.

## Impact

Repository tooling and process documentation only: `scripts/`, `test/`, `docs/`, `package.json`, `package-lock.json`, and `Makefile`. The published package's runtime code and packaged documents do not change; its `package.json` gains the `verify:links` script and the `marked` development dependency, which the tarball does not contain. A branch whose active change or documents hold a failing link fails `make verify` after it merges `dev`, with a message naming the file, line, target, and reason.

Exclusions: no file under `openspec/changes/archive/` changes; the archived links stay as they are and only leave the baseline when a later change corrects them. The packaged README and `docs/architecture.md` keep the relative links that `scripts/verify-package.ts` requires.
