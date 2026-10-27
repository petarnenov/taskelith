## 1. Evidence

- [x] 1.1 Check the follow-up's source in the 24a record, commit `73c0b2f7`, the 25b and 25c records, `docs/dependencies.md:127`, and the requirement "Linux test image per architecture".
- [x] 1.2 Run `make verify-linux-cgroup` on this Linux x86_64 host and record it.

## 2. Documentation

- [x] 2.1 Append the resolution note to the ADR 0015 bullet "Multi-architecture `make verify-linux-cgroup`".
- [x] 2.2 Append the resolution to the matching row of `docs/foundation.md`.

## 3. Verify

- [x] 3.1 Run `npm run openspec -- validate close-verify-linux-cgroup-multi-arch --strict`.
- [x] 3.2 Run `make verify`.
- [x] 3.3 Independent review.
