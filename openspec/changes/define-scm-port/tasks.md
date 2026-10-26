## 1. Module and port

- [x] 1.1 Add the `@taskelith/integrations` module package with its root export and `./port` entry.
- [x] 1.2 Add the draft `SourceControlProvider` port and its capabilities.

## 2. Conformance suite

- [x] 2.1 Add `runSourceControlConformance` and its fixture.
- [x] 2.2 Test it against a test-only in-memory SCM and against defective variants.

## 3. Records

- [x] 3.1 Record the GitHub and Forgejo mapping in `design.md`.

## 4. Verification and review

- [ ] 4.1 Dry-run the archive in a copy of `openspec/` and run `validate --all --strict` there.
- [ ] 4.2 Run `make verify` and record the results.
- [ ] 4.3 Obtain independent review (Codex Sol medium, read-only) and record results.
