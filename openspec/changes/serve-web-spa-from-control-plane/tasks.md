## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Implementation and tests

- [x] 2.1 SPA answer under `/app/` on the browser endpoint after every route, with the fallback, the JSON 404 of a missing file, and the `web-app` log operation
- [x] 2.2 Cache headers: immutable hashed assets, `no-cache` page and other files
- [x] 2.3 Content security policy with a fresh style nonce per page, and the related headers
- [x] 2.4 Build read once at start from `TASKELITH_WEB_APP_DIR` without following links; refused dot, separator, and NUL segments; failed start for a broken build, 404 without one
- [x] 2.5 Vite's `html.cspNonce` placeholder and the nonce passed to Mantine's `getStyleNonce`
- [x] 2.6 `TASKELITH_WEB_APP_DIR` in the control-plane image
- [x] 2.7 Tests for each behavior, with fail-before evidence for traversal, fallback, shadowing, cache headers, and the policy

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec deltas, this task list, the README section, and the installation contract's listeners
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
