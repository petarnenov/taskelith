# Verification: align-comment-rule-text

Date: 2026-10-25.

## Scope and source

The coordinator assigned this change on 2026-10-25. The owner had chosen a separate small docs change, rather than a fix inside the archived change `enforce-comment-length`, to align the comment rule in `AGENTS.md` and worker step 3 of `docs/agent-task-protocol.md` with the `engineering-principles` requirements "Comment length bound", "Comment length scope", and "Comment length check". Base revision: `79ef345` on `dev`. Scope: those two texts and this change. Prepared in a git worktree. The change has no spec delta (`skip_specs: true`): it applies existing requirements.

## Author self-check before review

- The bound, the counting rules, and the attribution "(owner rule, 2026-10-24)" are unchanged in `AGENTS.md`; only the scope and exemption sentences changed, and one sentence naming the check was added.
- The file kinds in `AGENTS.md` are those of the requirement "Comment length scope"; "whether or not a change's diff touches it" follows its scenario "Existing long comment untouched"; the fixture exemption follows its scenario "Captured evidence"; and `make verify` runs `npm run verify:comments` (`Makefile`, `package.json`).
- Worker step 3 names the same scope categories, exemptions, and check, and still points to `AGENTS.md`.
- Evidence check: the change adds no link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed at `30fdd5f` and again after the pass-1 fixes; `npm run openspec -- validate align-comment-rule-text --strict` passed.

## Independent review

Assigned reviewer (coordinator): Claude Code with `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree. `claude-fable-5-1` was the only model in the JSON `modelUsage`. The prompt named `AGENTS.md`, ADR 0004, the governance review process, the agent task protocol, and the `engineering-principles` specification as criteria. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after the pass were equal.

- **Pass 1 at `30fdd5f` — session `500d2e4e-bb28-4e1b-b382-5a9719771577`.** The reviewer confirmed that both texts match the three requirements and `scripts/check-comment-length.ts` in meaning, that the bound and attribution are unchanged, and that no other unarchived text keeps the old rule. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. Findings 1 to 4 were fixed without another pass, as the review process allows for a Low-only pass; **these fixes have not been independently reviewed**:
  1. Low: "such captures, such as" in `AGENTS.md` read awkwardly. Now "those captures, for example".
  2. Low: the rule sentence of worker step 3 was too long, and "captures under `docs/qualification/`" differed from the term in `AGENTS.md`. Split into two sentences using "captured third-party artifacts under `docs/qualification/`".
  3. Low: this record referred to the owner's "option (a)" without saying what the options were. It now names the choice.
  4. Low: this record was a draft. Completed as worker step 6 requires.
  5. Low, outside this change's scope: `scripts/check-comment-length.ts` also checks `.mts`, `.cts`, `.mjs`, and `.cjs` files, and the repository tracks one `.mjs` file, while the requirement "Comment length scope" names only `*.ts` and `*.js`. The texts correctly follow the requirement; the archived design of `enforce-comment-length` treats these as TypeScript and JavaScript. Not changed; reported to the coordinator as a possible follow-up spec change.

## Limitations

The fixes after pass 1 have not been independently reviewed.

## Remaining gates

Merge into `dev` and archive by the coordinator.
