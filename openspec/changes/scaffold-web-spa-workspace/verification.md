# Verification: scaffold-web-spa-workspace

## Scope and source

G3 item 28 (`docs/g3-plan.md`, row 28), sub-change 28a, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `115c16c4`: the `apps/web` workspace with the D1 and D17 libraries, its build and Vitest tests in `make verify`, the browser application's exemptions from the package contract and the Node coverage, the generated control-plane types with a drift check, a typed fetch with the CSRF header, the bundle boundary, and `make web-build`, `make web-test`, and `make web-dev` ([design](design.md), decisions 1 to 9). The coordinator approved the split into 28a, 28b, and 28c and decided D1 to D5 on 2026-10-29; the design records them verbatim.

## Revision

- Base: `dev` `115c16c4` (#414), the brief's checklist base; `git fetch origin` before the worktree was created showed `origin/dev` at `115c16c4`.
- `b17c1fc8` `chore: start the scaffold-web-spa-workspace change` (the brief's `checklist.json`, saved `--at 115c16c41016ae5f45dee6609558a9299ef8b165 --size M-L`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `ff6a7795` `chore: add the exact-pinned dependencies of the web SPA workspace`: `apps/web/package.json`, `package-lock.json`, `docs/dependencies/license-reviews.json` (29 new reviews), and the regenerated `licenses.json` and `sbom.cdx.json`, every dependency addition in this one commit.
- `3e221892` `chore: scaffold the web SPA workspace with generated control-plane types and a CSRF-aware fetch`.
- `b4460b36` `chore: build, test, and measure the browser application in make verify`.
- `e73ff2e3` `chore: keep server modules, environment values, secrets, and external origins out of the web bundle`.
- `397ffd3e` `docs: record the scaffold-web-spa-workspace design, spec deltas, and plan split`: the proposal, the design, the spec deltas, the task list, this record, the dependency register, `docs/g3-plan.md` row 28, and the README.
- `ac04ad01` `docs: route the scaffold-web-spa-workspace change` (`route.json`, unedited). The first `make verify` on that tree (log `verify-28a-1.log` in the session scratchpad) passed every test, tests 3927, pass 3918, fail 0, skipped 9, and the web tests, then failed `npm run verify:dependencies`: the inventory records the hash of the root `package.json`, whose `test` script `b4460b36` changed after the inventory of `ff6a7795`.
- `68de6c09` `chore: regenerate the dependency inventory for the web test scripts`: `make dependency-inventory` changed only that hash in `docs/dependencies/licenses.json`; no dependency changed, so the additions stay in `ff6a7795`.
- `7a436fbc` `docs: route the scaffold-web-spa-workspace change again after the inventory regeneration` (`route.json`, unedited, at head `68de6c09`): the regeneration changed the diff outside the change directory, so under worker step 4 the first route was deleted and the change routed again. "route: elevated (lines, files, capabilities, size), rule version 2"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.81) and agrees; recommendation only. The route's pass 2 reviewer differs from the brief's `claude claude-fable-5-1#medium`, and its efforts are above the brief's; the brief's reviewers stand unless the coordinator decides otherwise. `git fetch origin` before routing showed `origin/dev` at `2250f3f7` (#415, `assign-fable-to-review-pass-2`), which this branch has not merged.
- `92c01f55` `docs: record the make verify of scaffold-web-spa-workspace`, the `make record` of the passing second `make verify` on the tree of `7a436fbc` (log `verify-28a-2.log` in the session scratchpad). The web workspace's own Vitest coverage in that run: tests 17, pass 17; statements 100% (30/30), branches 100% (24/24), functions 100% (9/9), lines 100% (24/24); `Every product module is in the coverage report.`
- `f926cc4c` `chore: give each allowed web bundle URL a reason and test that the dist holds no development file`, under the coordinator's answers before pass 1 (design, "Coordinator decisions before pass 1"): `ALLOWED_URLS` becomes a map from each exact URL to its one-line reason (answer 4), and a new test over the real dist refuses any file other than `index.html` and the hashed `assets/index-*` scripts and stylesheets and any literal that only `dev-server.ts` or a web test holds (answer 3).
- `docs: record the coordinator's answers before pass 1 of scaffold-web-spa-workspace`: the verbatim answers in the design, the register's same-minor patch rule for `react-router@8.5.1` and "Used from 28b" for Router, Query, and Mantine (answers 1 and 2), and this record. The register is not an input of the dependency inventory, so `npm run verify:dependencies` still passed with no regeneration.
- `2da8970a` `docs: route the scaffold-web-spa-workspace change again after the pre-pass-1 changes` (`route.json`, unedited, at head `f6370c12`): `f926cc4c` and the register edit of `f6370c12` changed the diff outside the change directory after the route of `7a436fbc`, so under worker step 4 that route was deleted and the change routed again. The result is unchanged: "route: elevated (lines, files, capabilities, size), rule version 2", pass 1 `codex gpt-6-astra#high`, pass 2 `claude claude-opus-5-5#xhigh`, pass 3 `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.83) and agrees; recommendation only. `git fetch origin` before routing showed `origin/dev` at `2250f3f7`.
- `docs: record the make verify of scaffold-web-spa-workspace after the pre-pass-1 changes`, the `make record` of the third `make verify` (log `verify-28a-3.log` in the session scratchpad); its result is in "Generated checks".
- Review pass 1 fixes: `8942c89a` `chore: catch IP, single-label, and userinfo origins in the web bundle check`, `98e910ad` `chore: close environment-read and source-escape gaps in the web boundary check`, `b37a950e` `chore: require the OpenAPI-required options of the typed web fetch`, and `f534859b` `docs: align the CSRF requirement, register links, and lockfile count of scaffold-web-spa-workspace`; then the pass 1 record and the `make record` of the fourth `make verify` (log `verify-28a-4.log` in the session scratchpad). `route.json` is not routed again after review fixes.
- Review pass 2 fixes: `9e165642` `chore: type undocumented web fetch statuses as unknown and read empty JSON answers`, `b384b1f9` `chore: stop make web-dev with a clear message without a project or OpenSSL 3`, and `1e887c32` `docs: align register versions, the user-event note, and the dev proxy CA condition of scaffold-web-spa-workspace`; then the pass 2 record and the `make record` of the fifth `make verify` (log `verify-28a-5.log` in the session scratchpad).
- Review pass 3 fixes, unreviewed (no pass follows pass 3): `c1d0f379` `chore: catch percent-encoded, Unicode, and escaped origins in the web bundle check` and `f7186f8c` `docs: record the invocation and model confirmation of review pass 2 of scaffold-web-spa-workspace`; then the pass 3 record and the `make record` of the sixth `make verify` (log `verify-28a-6.log` in the session scratchpad).

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and npm 12.2.1 (the `Makefile` pin); OpenSSL 4.0.3 for the development certificate; Docker for the services of `make test` and the installation images.

## Author self-check

- Scope: 28a only, as the coordinator's approved scope lists it. The shell, routing, login and sessions, themes, D10 navigation, the contrast test, and the badge test (28b), static serving, the SPA fallback, and the CSP (28c), and items 29 to 34 and 40 are untouched. The only page names the scaffold and promises nothing that exists; the README states that the SPA runs only through `make web-dev` until 28c.
- Dependencies: only the approved list. D1 additions `@vitest/coverage-v8@5.0.5`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.8` (no `jest-dom`), `@types/react@19.3.0`, and `@types/react-dom@19.3.0`; the item 1 versions `react@19.3.1`, `react-dom@19.3.1`, `vite@8.3.5`, `@vitejs/plugin-react@6.1.2`, `vitest@5.0.5`, `jsdom@30.1.3`, and `@tanstack/react-query@5.104.5`; the same-minor patches `@mantine/core@9.7.4`, `@mantine/hooks@9.7.4`, and `react-router@8.5.1` (design, decision 8). `openapi-fetch` is not used; `openapi-typescript@7.13.0` was already a root development dependency. All are exact-pinned development dependencies of the private `@taskelith/web`; root TypeScript stays 5.9.3. A semantic comparison of the lockfiles shows 153 added entries, none changed or removed. `npm audit` reports the same two findings as at the base (`ip-address`, `undici` inside the release plugin's npm). osv.dev returned no record for any pinned version on 2026-10-29; the register rows record the recheck date, the advisory checks, licenses, and maintenance evidence.
- Inventory: `npm run inventory:dependencies` first failed on 29 unreviewed license coverage gaps, the 15 `@rolldown/binding-*` and 11 `lightningcss-*` platform packages, `fsevents`, `react-remove-scroll-bar@2.3.8`, and `saxes@6.0.0`. Each published tarball was listed on 2026-10-29 and reviewed as `text-located`; then generation passed with 918 package paths and 70 reviewed gaps.
- Wire: no change; `git diff 115c16c4 HEAD -- packages/contracts` is empty. The generated types cover the 39 paths of `control-plane.openapi.json` only.
- Secrecy: no CA, key, certificate, secret, or token is in the repository, the bundle, the tests, or a log. `scripts/web-dev.sh` writes the CA copy and the development key to a temporary directory and deletes it on exit; the bundle check refuses PEM blocks; the secret fixtures of `test/check-web-bundle.test.ts` are assembled at run time from fragments, so no secret shape is tracked; the fetch tests use the fixture strings `csrf-fixture` and `fixture-password`.
- Hexagonal and boundaries: SPA source imports no workspace package, Node built-in, or server SDK, and reads only `import.meta.env.MODE`; `npm run check:boundaries` passed.
- Spec deltas: `workspace-packages` modifies "Workspace package layout" (435 characters), keeping its four scenarios unchanged and adding "Browser application", and adds "Browser application contract" (369) and "Browser application build and test" (351); `engineering-principles` modifies "Code coverage threshold" (433), keeping its three scenarios and adding "Untested browser application module"; `product-ui` adds "Web SPA control-plane client" (398, 372 before review pass 1), "Web SPA development server" (473, 425 before review pass 2), and "Web SPA bundle boundary" (413, 381 before review pass 1). None is removed. "Workspace package contract" (478 characters) is not modified: the layout requirement routes the browser application to its own requirements.
- Comments: `npm run verify:comments` passes. It does not check `.tsx` files; under the coordinator's answer 6 every comment in the tracked `apps/web` `.tsx` files was checked by hand on `f926cc4c`: the only one, in `apps/web/src/App.tsx`, is one line of 68 characters, so nothing needed a fix.

## Fail-before

Each behavior was broken in place on `e73ff2e3`, unless its entry names another revision, its tests run, and the file restored with `git checkout`; the logs, each with its diff and command, are in the session scratchpad.

- Browser application contract and build (`fb-28a-build-contract.log`): `scripts/build-workspaces.ts` checks every workspace against the package contract, as at the base. `test/browser-application.test.ts`: tests 7, pass 4, fail 3; the fixture builds fail on the package contract (`exports must be only the root entry ...`, `tsconfig.json is missing`) instead of running the build script or naming the dependency problems.
- Coverage scope (`fb-28a-coverage-scope.log`): no browser application report read. `test/check-coverage-scope.test.ts`: tests 9, pass 7, fail 2; the untested `.tsx` module and the missing report are not reported.
- Node test pattern (`fb-28a-node-test-glob.log`): the base pattern `'apps/*/test/*.test.ts'` restored in `package.json`; the pattern test fails, matching `apps/web/test/client.test.ts` and `apps/web/test/dev-server.test.ts`.
- Root typecheck (`fb-28a-root-typecheck.log`): the `exclude` removed from `tsconfig.check.json`; the typecheck test fails, and `tsc -p tsconfig.check.json` reports `TS2835` and `TS2345` in `apps/web/src/api/client.ts` and the web tests.
- Environment reads (`fb-28a-web-environment.log`) and workspace imports (`fb-28a-web-workspace-import.log`): each web rule disabled in `scripts/check-boundaries.ts`; the web boundary test fails each time, missing the three `import.meta.env` violations and the two `@taskelith/` imports.
- CSRF header (`fb-28a-csrf-header.log`): the header never set; the Vitest run: tests 17, pass 15, fail 2 (POST and DELETE). Header also on GET (`fb-28a-csrf-get.log`): tests 17, pass 16, fail 1.
- Development server bind (`fb-28a-dev-server-host.log`): `host` `0.0.0.0`; `test/dev-server.test.ts`: tests 5, pass 4, fail 1.
- Generated types with comments (`fb-28a-types-comments.log`): the generator returns `openapi-typescript`'s output unprinted; `test/generate-web-api-types.test.ts`: tests 4, pass 2, fail 2 (the committed file no longer matches, and the description comments are back).
- Type drift (`fb-28a-types-drift.log`): one operation changed in the committed `apps/web/src/generated/control-plane.ts`; `npm run verify:web-api-types` exits 1 naming the stale file, and the drift test fails.
- External font (`fb-28a-bundle-font.log`): a Google Fonts stylesheet link added to `apps/web/index.html` and the SPA rebuilt; the real-dist bundle test fails with `index.html: references the external origin of https://fonts.googleapis.com/css2?family=IBM+Plex+Sans`. The other secret, environment, and origin shapes are unit-tested on fixtures.
- Development files in the dist (`fb-28a-dist-excludes.log`), on `92c01f55` with the new test of `f926cc4c`: an import of `CONTROL_PLANE_ORIGIN` from `dev-server.ts` added to `apps/web/src/main.tsx` and the SPA rebuilt with `vite build`, then `apps/web/test/client.test.ts` copied into a new `apps/web/public/` and rebuilt; the test "the built web SPA holds neither dev-server.ts nor a web test" fails both times (tests 1, pass 0, fail 1), first with `the dist holds https://127.0.0.1:8443 of dev-server.ts`, then with the unexpected file `client.test.ts`, and passes after the restore and a rebuild.
- Exact URL allowlist (`fb-28a-allowlist-exact.log`): `scripts/check-web-bundle.ts` of `92c01f55`, a set of URLs without reasons, with the test file of `f926cc4c`; `test/check-web-bundle.test.ts`: tests 16, pass 15, fail 1, "every allowed URL is an exact string with a one-line reason".
- Review pass 1, finding 1 (`fb-28a-P1-1-url-origins.log`): the new test with the pattern of `000b25ad`; `test/check-web-bundle.test.ts` "an IP, single-label, or userinfo origin fails the check" fails, `https://127.0.0.1:8443/x` unreported.
- Review pass 1, finding 2 (`fb-28a-P1-2-env-evasions.log`): the new test with the rule of `000b25ad`; it fails on `import.meta["env"].VITE_TOKEN`, no violation.
- Review pass 1, finding 3 (`fb-28a-P1-3-web-source-escape.log`): the new test with the rules of `000b25ad`; `checkWorkspaceBoundaries` returns no violation for the `../bridge` chain.
- Review pass 2, finding 1 (`fb-28a-P2-1-web-dev-openssl.log`): the new `test/web-dev-script.test.ts`, with stub `openssl` and `docker`, against the script of `9e165642`: tests 3, pass 1, fail 2; without a project the script prints `$1: unbound variable`, and with `LibreSSL 3.3.6` it names no version and goes on to the installation.
- Review pass 2, finding 2 (`fb-28a-P2-2-client-results.log`): the new client tests with the client of `1d598d68`: the Vitest run, tests 13, pass 10, fail 3 (the empty JSON answer throws, and `hasStatus` is missing); `tsc -p apps/web/tsconfig.tooling.json` exits 2 with the missing export and two unused `@ts-expect-error` directives (TS2578).
- Review pass 1, finding 4 (`fb-28a-P1-4-required-options.log`): the new client test with the types of `000b25ad`; `tsc -p apps/web/tsconfig.tooling.json` exits 2 with five unused `@ts-expect-error` directives (TS2578).
- Review pass 3, finding 1 (`fb-28a-P3-1-url-decoding.log`): the two new tests with `scripts/check-web-bundle.ts` of `cb1dc3a3`: tests 2, pass 0, fail 2; `https://%65vil.example/x` and every escaped form of `https://fonts.googleapis.com/css` are unreported.

## Image size

`make installation-build` at the base (`115c16c4`, in a temporary detached worktree) and at this branch (`e73ff2e3` with the records' working tree; the images are built from tracked files), on the same host, log `image-size-28a.log` in the session scratchpad:

| Image | Base bytes | Branch bytes | Change |
| --- | --- | --- | --- |
| `taskelith-control-plane` | 331,863,706 | 332,947,507 | +1,083,801 (+0.33%) |
| `taskelith-worker` | 404,305,373 | 405,389,174 | +1,083,801 (+0.27%) |

`npm prune --omit=dev` removes every web library from the runtime stage; the growth is mainly `apps/web` (764 KiB, of which `dist/` is 516 KiB); the pruned `node_modules` grew by 64 KiB (34,648 to 34,712 KiB by `du -sk`), with the `@taskelith/web` link, 15 scope directories that the prune leaves, and an empty `.vite-temp`. The images were removed after the measurement.

## Development server

`make web-dev` needs a running installation for `make installation-ca`, which this host did not run. The server itself was started once by hand with a throwaway self-signed certificate as both CA and server certificate: it listened on `[::1]:5173` only, served `/app/` over HTTPS, and answered `/session` with `502` because nothing listened on `127.0.0.1:8443` (proxy error `ECONNREFUSED 127.0.0.1:8443`), so the proxy target is right and no request reached anything else.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test` of the new and changed root tests after `npm run build` | `e73ff2e3` | tests 76, pass 76, fail 0: workspace packages, coverage scope, boundaries, browser application, bundle, web API types, contract generation, comment length |
| `npm run test --workspace=@taskelith/web` | `e73ff2e3` | tests 17, pass 17, fail 0; statements 100% (30/30), branches 100% (24/24), functions 100% (9/9), lines 100% (24/24) |
| `make web-build` | `e73ff2e3` | built `dist/index.html`, one script of 264.24 kB and one stylesheet of 248.44 kB; `The web bundle holds no secret shape, environment value, or external origin.` |
| `npm run verify:comments` | records working tree | `Every comment is within the comment length rule.` |
| `npm run check:boundaries` | `e73ff2e3` | `Workspace and hexagonal boundary checks passed.` |
| `npm run verify:dependencies` | `ff6a7795` | `Verified 918 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)` |
| `node --experimental-strip-types --test test/check-web-bundle.test.ts` over the rebuilt dist | `f926cc4c` | tests 16, pass 16, fail 0 |
| `npx tsc -p tsconfig.check.json --noEmit`, `npm run check:boundaries`, `npm run verify:dependencies` | `f926cc4c` | no type error; `Workspace and hexagonal boundary checks passed.`; `Verified 918 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)` |
| `npm run openspec -- validate scaffold-web-spa-workspace --strict` | records working tree | `Change 'scaffold-web-spa-workspace' is valid` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `faac95183ff8380595ccd9d64bf3386e517d1215`; tests 3935, pass 3926, fail 0, skipped 9; all files 99.38% lines, 92.55% branches, 98.84% functions.
- `npm run openspec -- validate scaffold-web-spa-workspace --strict`: passed, `Change 'scaffold-web-spa-workspace' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 91 file(s); every pass summary file is valid: 71 file(s); every route file is valid: 27 file(s).`.
- Spec diff against the merge base `115c16c41016` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18644-4836-70c0-939b-9650724bcf08` | 0 | 0 | 4 | 3 |
| 2 | B | `claude claude-fable-5-1#medium` | `e76ef202-63df-407f-8dac-41bf7f3a3e03` | 0 | 0 | 1 | 5 |
<!-- make record: end -->

## Independent review

Review plan (governance v9, at most three passes, stopping at a pass that reports only Low findings or none):

- Pass 1: reviewer A `codex gpt-6-astra#medium`.
- Pass 2: reviewer B `claude claude-fable-5-1#medium`, by owner decision 2026-10-29 (governance v9, on `dev` as #415 `2250f3f7` after this change's route was recorded).
- Pass 3, only after a pass 2 with a Medium or worse finding: reviewer A `codex gpt-6.1-sol#medium`.

`route.json` recommends `claude-opus-5-5#xhigh` for pass 2 and `high` for passes 1 and 3; every pass runs at `medium` because routed effort is not authorized, and the coordinator confirmed this plan and the recorded mismatch (answer 7).

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, sandbox read-only, session `01a18644-4836-70c0-939b-9650724bcf08`, on `000b25ad` (diff against the merge base `115c16c4`). Worktree snapshots by `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`: before the review `31ae2078f6b8772a80a8a6126164d7fa819d19bf84dace33c95d3908f1834911`, after it the same value, so the review changed no file. This section first recorded only the snapshot before; review pass 2 (finding 4) asked for the one after, which the worker session Pepi had taken and now records.
- Invocation (from `make review`): `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /Users/petarnenov/taskelith-worktrees/scaffold-web-spa-workspace -`, environment `PATH HOME USER LANG TERM TMPDIR`, started 2026-10-29T06:06:23.344Z. Model confirmation: `model: gpt-6-astra (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`, printed by `make review`, which also printed "route: recommends effort high; the authorized medium applies (policy version 8)".
- Result: Critical 0, High 0, Medium 4, Low 3, matching the pass 1 line of `passes.jsonl`; all seven fixed and recorded in `findings.jsonl`. The reviewer ran neither `make verify` nor an installation check.
  1. Medium, contract-drift (`scripts/check-web-bundle.ts:40`): the URL pattern needed a DNS name with an alphabetic top-level domain, so `https://127.0.0.1:8443/x`, `https://[::1]:8443/x`, `https://localhost:8443/x`, and `https://user:pass@evil.example/x` passed. Fixed in `8942c89a`: any host after `//`, with optional userinfo and port.
  2. Medium, redaction (`scripts/check-boundaries.ts:278`): only a direct `import.meta.env` property access was seen, so `import.meta["env"]`, `(import.meta).env`, aliases, and destructuring passed. Fixed in `98e910ad`: web source may use `import.meta` only as the object of a static member other than `env`, or as exactly `import.meta.env.MODE`.
  3. Medium, contract-drift (`scripts/check-boundaries.ts:250`): `apps/web/src/main.ts` could import `../bridge`, which re-exported `@taskelith/access`, without a violation. Fixed in `98e910ad`: web source may import by relative path only inside `apps/web/src/`, which the requirement "Web SPA bundle boundary" now states.
  4. Medium, contract-drift (`apps/web/src/api/client.ts:21`): path, query, body, and the options argument were always optional. Fixed in `b37a950e`: each is required exactly when the generated operation requires it (design, decision 5).
  5. Low, spec-wording (`specs/product-ui/spec.md:4`): the requirement demanded the CSRF header on every request other than GET. Fixed in `f534859b`: the token is sent while it is known, with the scenario "Request other than GET without a known token".
  6. Low, process (`docs/dependencies.md:143`, `:144`): unpinned evidence links. Fixed in `f534859b`: release tags `v16.3.3`, `v10.4.2`, and `v14.6.8`, and the exact npm version pages of `@types/react` and `@types/react-dom` 19.3.0.
  7. Low, evidence-mismatch (`proposal.md:28`): 128 packages against 153 entries. Fixed in `f534859b`: 153 lockfile entries.
- Fail-before of the new tests: the entries "Review pass 1" in "Fail-before". Findings 5 to 7 change records only.

### Pass 2

- Reviewer B: Claude Code, model `claude-fable-5-1`, effort `medium`, session `e76ef202-63df-407f-8dac-41bf7f3a3e03`, on `1d598d68` (diff against the merge base `115c16c4`). Worktree snapshots by the method of pass 1: before the review `d61fa0aede7f975feddb6da890d68360139a3d0dcfe8d7954fc0181411c6765e`, after it the same value, so the review changed no file.
- Invocation (from `make review`): `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM TMPDIR`, started 2026-10-29T06:25:13.343Z. Model confirmation: `model: claude-fable-5-1 (reported)`, printed by `make review`, which reports no effort for Claude Code and also printed "route: recommends claude claude-opus-5-5#xhigh; the brief's claude claude-fable-5-1#medium stays". This section first said only "run with `make review`"; review pass 3 (finding 2) asked for the invocation and the model confirmation, taken from the saved `make review` output.
- Reviewer mismatch: `route.json` recommends `claude claude-opus-5-5#xhigh` for pass 2; `claude claude-fable-5-1#medium` ran by owner decision 2026-10-29 (governance v9, #415 `2250f3f7`), as the coordinator confirmed (answer 7).
- Result: Critical 0, High 0, Medium 1, Low 5, matching the pass 2 line of `passes.jsonl`; all six fixed and recorded in `findings.jsonl`, each with `missedBy` pass 1 except finding 4, which concerns the pass 1 record written after that pass. The reviewer confirmed the seven pass 1 fixes and ran `npm run verify:web-api-types` and `test/check-web-bundle.test.ts`.
  1. Medium, error-handling (`scripts/web-dev.sh:11`): `openssl req -noenc ... 2>/dev/null` hid the error, and the LibreSSL 3.3.6 of macOS's `/usr/bin/openssl` has no `-noenc`, so `make web-dev` stopped silently; an empty `INSTALLATION` gave `$1: unbound variable`. Fixed in `b384b1f9`: `${1:?usage: web-dev.sh PROJECT}`, a check that stops with "make web-dev needs OpenSSL 3.0 or later (found: ...)" before anything else runs, the error output no longer hidden, and the need stated in the README.
  2. Low, contract-drift (`apps/web/src/api/client.ts:41`): the result typed only documented statuses, so a proxy's 502 looked like a documented answer, and an empty body with `Content-Type: application/json` made `response.json()` throw. Fixed in `9e165642`: `ApiResult` adds `UndocumentedResult` (any status, `unknown` body), `hasStatus` narrows a result to a documented status and its body, and an empty JSON answer has no body.
  3. Low, evidence-mismatch (`docs/dependencies.md:139`, `:141`): the version column named `react-router@8.5.0` and Mantine `9.7.3`. Fixed in `1e887c32`: the column and the upstream links name `8.5.1` and `9.7.4`; the evaluated versions stay in the last column.
  4. Low, process (`verification.md:119`): no snapshot after pass 1. Fixed in this record: the pass 1 section records both snapshots and the method.
  5. Low, spec-wording (`README.md:61`, `specs/product-ui/spec.md:19`): "trusting only the installation CA" held only while the composition's browser endpoint serves the API certificate. Fixed in `1e887c32`: the requirement and the README name the local composition, whose endpoint serves a certificate of the installation CA until 26d, and the README states that another CA fails the proxy's TLS check.
  6. Low, docs (`docs/dependencies.md:143`): `user-event` was described as used by the SPA's tests. Fixed in `1e887c32`: installed for 28b and unused in 28a.
- Note without severity: the worker image builds and keeps `apps/web/dist` (+1,083,801 bytes) without using it; not changed in 28a.
- Fail-before of the new tests: the entries "Review pass 2" in "Fail-before". Findings 3 to 6 change documentation and records only.
- Pass 3, reviewer A `codex gpt-6.1-sol#medium`, follows because this pass reported a Medium finding.

### Pass 3

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox read-only, session `01a1866a-e28a-7a93-9cf6-525f052d286c`, on `cb1dc3a3` (diff against the merge base `115c16c4`). Worktree snapshots by the method of pass 1: before the review `52a2d6564a7c2e03e0782e9fc4094f7be1302baf870a30f6e00645e9abd1f933`, after it the same value, so the review changed no file.
- Invocation (from `make review`): `codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only -C /Users/petarnenov/taskelith-worktrees/scaffold-web-spa-workspace -`, environment `PATH HOME USER LANG TERM TMPDIR`, started 2026-10-29T06:48:33.214Z. Model confirmation: `model: gpt-6.1-sol (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`, printed by `make review`, which also printed "route: recommends effort high; the authorized medium applies (policy version 8)".
- Result: Critical 0, High 0, Medium 1, Low 1, matching the pass 3 line of `passes.jsonl`; both fixed and recorded in `findings.jsonl`. The reviewer confirmed the 13 fixes of passes 1 and 2 and ran the drift, type, inventory, comment, boundary, and bundle checks, but not `make verify`; the fixture test of `test/check-web-bundle.test.ts` failed only because the read-only sandbox forbids `mkdtemp`, which is no finding.
  1. Medium, contract-drift (`scripts/check-web-bundle.ts:42`): `https://%65vil.example/x`, `https://例え.テスト/x`, and `href="https:&#47;&#47;fonts.googleapis.com/..."` passed. Fixed in `c1d0f379`, unreviewed: a host label may hold percent escapes and non-ASCII characters, and each file is also checked as its syntax decodes it, markup through character references, scripts through `\u`, `\x`, and punctuation escapes, and style sheets through CSS escapes; a new scenario "Escaped external URL" states it. `missedBy` pass 2, which reviewed the same pattern.
  2. Low, process (`verification.md:137`): the pass 2 record said only "run with `make review`". Fixed in `f7186f8c`, unreviewed: the pass 2 section records the invocation and the model confirmation from the saved `make review` output.
- Fail-before of the new tests: the entry "Review pass 3" in "Fail-before". Finding 2 changes records only.
- Architect check of the unreviewed fixes `c1d0f379` and `f7186f8c` by the coordinator: pending.

## Limitations

- The SPA is not served by the control plane until 28c; `make web-dev` is its only way to run, and it was not run against an installation (see "Development server").
- `dev-server.ts` and `scripts/web-dev.sh` have no automated test against a running control plane; the unit tests cover the bind address, the strict port, the proxy pattern, and the CA-only agent.
- `make web-dev` needs OpenSSL 3.0 or later in `PATH` for the development certificate; the LibreSSL of macOS's `/usr/bin/openssl` does not suffice, and the script stops and names the version it found.
- The fetch does not validate answer bodies against the document, and it covers JSON operations only; the SSE stream and the terminal WebSocket belong to later items.
- React Router, TanStack Query, and most of Mantine are installed but unused until 28b (design, decision 8).
- `npm run verify:comments` does not check `.tsx` files; the comment rule's file list in `AGENTS.md` does not name them. The coordinator proposes to the owner extending the rule to `.tsx` and `.jsx` as a separate follow-up (answer 6).
- The bundle check's script decoding leaves a letter escape such as `\e` as it is, because in a regular expression it names a class such as `\s`; the minifier writes string literals without one.
- The bundle URL allowlist is exact, so an upgrade that changes a React or Mantine error link needs a reviewed list change.

## Remaining gates

- `make web-dev` was not run against a real installation (see "Development server"); 28c or the first installation run closes this gate (coordinator answer 5).
- The coordinator's architect check of the unreviewed commits after `cb1dc3a3`, the pass 3 fixes `c1d0f379` and `f7186f8c` and their records (governance "Architect check of unreviewed fixes").
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
