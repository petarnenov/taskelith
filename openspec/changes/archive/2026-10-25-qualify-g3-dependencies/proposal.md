## Why

The G3 work plan (`docs/g3-plan.md`, item 1, `qualify-g3-dependencies`) requires established open-source dependencies for G3 (ADR 0004, R35) and evidence for the owner's decisions D1, D2, D3, D5, D17, and D18, all decided on 2026-10-25. Items 10, 16, 19, 28, 39, and 40 install or call these libraries and tools; the dependency policy requires their exact versions, licenses, security routes, advisories, and maintenance evidence to be recorded first.

G3 has not started. On 2026-10-25 the owner authorized this one documentation-only item to start ahead of the G3 start, while G2 finishes. Every other G3 item stays not started.

## What Changes

- Add `docs/g3-dependencies.md`: a source-cited evaluation, at their latest versions, of the SPA libraries (D1) and Mantine (D17), the password-hashing and session building blocks (D2), the `git` CLI (D3), the pinned Claude Agent SDK and its bundled CLI (D5), the GitHub API client, and xterm.js and node-pty for the web terminal (D18), with versions, licenses, security reporting routes, advisories, maintenance evidence, and access dates; proposals are labeled as the author's.
- In `docs/dependencies.md`, add a "G3 dependencies" section that registers each evaluated component as `candidate`, and update the "Planned components" paragraph.
- Add the `g3-dependency-evaluation` capability.

## Capabilities

### New Capabilities
- `g3-dependency-evaluation`: a source-cited evaluation of the G3 libraries and tools, with each one registered as a candidate before it is installed.

### Modified Capabilities

None.

## Impact

Documentation only. No package is added to `package.json` or the lockfile, no code is written, and nothing is admitted beyond `candidate`; installation and admission belong to later items and the owner. The owner's decisions stand: where one turns out unsuitable, the evaluation reports it to the coordinator with options instead of swapping it.
