# Verification: fix-doctor-node-remedy

## Scope and source

The owner reported on 2026-10-24, paraphrased: from a shell on Node.js v24.21.0, `make doctor` failed the Node.js and npm checks and advised `make setup`; `make setup` reported every check passed; `make doctor` then failed again the same way. Base revision: `4a3e69e` on `dev`; `origin/dev` at `37445fc` (the agent task protocol, documentation only) was merged in before the first fix round. Prepared in a git worktree. Scope: `Makefile`, `scripts/environment-checks.ts`, `scripts/setup.ts`, `test/environment-checks.test.ts`, and this change.

## Author self-check before review

- Behavior of the checks is unchanged: the same facts pass and fail; only the remedies and the setup closing message change.
- The npm remedy depends on the Node.js check because each Node.js has its own npm; under the pinned Node.js it still names `make setup`.
- Evidence check: the changed files cite no external sources; the evidence is the local runs below.

## Checks

Node v24.22.1 installed through nvm, macOS, in the worktree:

- From a shell on Node v24.21.0 (npm 11.19.0): `make setup` passed every check under v24.22.1 and printed "These checks ran under Node.js v24.22.1, but your shell uses v24.21.0; run 'nvm use' before make doctor or make verify." Before review, `make doctor` then failed the Node.js check with the remedy starting "Run nvm use" (reworded in pass 1) and the npm check with "Fix the Node.js check first; npm is checked under Node.js 24.22.1.", and exited 2.
- After `nvm use`: `make doctor` passed all five checks.
- Not exercised: doctor's guard for a Node.js older than 22.6 (no such Node.js installed); its message was checked by reading the `Makefile`.
- `make verify` passed before review: 196 tests, 0 failed, coverage thresholds met, 30 strict OpenSpec validations, package verification.

## Independent review

Assigned reviewer: Claude Code, invoked as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json` from the task worktree; prompt and output kept in a scratch directory outside the worktree.

- **Pass 1 — session `006802ea-215c-4996-8f32-90c87a8a1ed7`, on `816808c` (later retyped, unchanged, as `5b37f4a` before the first push).** `modelUsage` reported `claude-fable-5-1`. SHA-256 snapshots before and after were equal. Findings: 0 Critical, 0 High, 1 Medium, 4 Low.
  1. Medium: doctor's guard for a Node.js too old to run the scripts (`Makefile`) still advised only `make setup`, the same detour for a pinned Node.js that is installed but not active. Resolved: the message now names `nvm use`, and `make setup` only for a pinned Node.js not installed; the spec scenario says so.
  2. Low: the Node.js remedy led with `nvm use` even without nvm. Resolved: it now reads "With nvm, run nvm use (…); without nvm, install Node.js … yourself."
  3. Low: setup's closing message had no automated test. Resolved: it is built by `shellNodeNotice` in `scripts/environment-checks.ts` and unit-tested.
  4. Low, outside this change: with the pinned Node.js active but no npm on `PATH`, doctor advises `make setup`, whose `install-npm` step needs npm and fails. Not changed here; reported to the coordinator as a follow-up candidate.
  5. Low: empty `### New Capabilities` heading in `proposal.md`. Not changed: it is the OpenSpec template's section, kept empty as in earlier changes.

After the pass-1 fixes: `make verify` passed (197 tests, 0 failed, 31 strict validations, package verification), and `make doctor` from a shell on v24.21.0 printed "With nvm, run nvm use (run make setup first if Node.js 24.22.1 is not installed yet); without nvm, install Node.js 24.22.1 yourself." and "Fix the Node.js check first; npm is checked under Node.js 24.22.1."

- **Pass 2 — session `83114c1a-d348-4127-bc18-6d98fc48451c`, on `6d8df80`.** `modelUsage` reported `claude-fable-5-1`. SHA-256 snapshots before and after were equal. All five pass-1 resolutions confirmed; the reviewer also ran `make doctor` without `node` on `PATH` to exercise the `Makefile` guard. Findings: 0 Critical, 0 High, 0 Medium, 4 Low. Low-only pass, so all four were fixed without another review (unreviewed fixes):
  1. Low: the check record quoted the pre-pass-1 remedy and did not quote the new ones. The record now marks the old text and quotes the new remedies.
  2. Low: the evidence check was not recorded. Added under the author self-check.
  3. Low: without `node`, the `Makefile` guard printed "Node.js not found cannot run the repository scripts." It now reads "the repository scripts need Node.js 22.6 or later (found: none)."
  4. Low: `shellNodeNotice` took two positional strings that could be swapped silently. It now takes `{ shell, setup }`.

After the pass-2 fixes: `make verify` passed (197 tests, 0 failed, 31 strict validations, package verification); `make doctor` with only `/usr/bin:/bin` on `PATH` printed the new guard message and exited 2; `make setup` from a shell on v24.21.0 printed the notice through `shellNodeNotice`.

## Remaining gates

Integration into `dev`, and archiving.
