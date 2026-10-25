# G3 dependency evaluation

Date: 2026-10-25. Status: evaluation for item 1 of the [G3 work plan](g3-plan.md) (`qualify-g3-dependencies`). G3 has not started; on 2026-10-25 the owner authorized this one documentation-only item to start ahead of the G3 start, while G2 finishes. Documentation only: no package was added to `package.json` or a lockfile, and no code was written. The owner decided D1, D2, D3, D5, D17, and D18 on 2026-10-25 ([G3 plan](g3-plan.md#owner-decisions)); this evaluation records evidence for the decided options and does not reopen them. Where a decision leaves a tool open, the recommendation is labeled **author's proposal**. Every component stays `candidate` in the [dependency register](dependencies.md#g3-dependencies); installation and admission belong to items 10, 16, 19, 28, 39, and 40 and to the owner.

## Evidence and markers

All sources were accessed on 2026-10-25. Package facts (version, publication time, license, engines, dependencies, `dist.integrity`, provenance) come from the npm registry document `https://registry.npmjs.org/<package>/<version>` and the attestations endpoint `https://registry.npmjs.org/-/npm/v1/attestations/<package>@<version>`; advisories come from osv.dev queries for the exact version (`POST https://api.osv.dev/v1/query`) and each repository's GitHub security advisories; "PVR" is GitHub private vulnerability reporting as `GET /repos/<owner>/<repo>/private-vulnerability-reporting` reports it. The registry, osv.dev, the GitHub API, and the package archives are unversioned services, so their facts are observations of that date. Repository files are cited at the release tag or commit.

- **(unverified)** marks a runtime claim taken only from documentation or source. Only these were exercised: `crypto.argon2` under Node 24.22.1 (section 3), the hashing libraries' loading under `--ignore-scripts` (section 3), `apt-cache policy git` in the pinned Ubuntu image and the local `git --version` (section 4), and the contents of packed tarballs (sections 5 and 7). Packing was done in a scratch directory outside the repository, without lifecycle scripts.
- "Releases in 12 months" counts stable versions published after 2025-10-25 across all release lines.
- Node compatibility is checked against the pinned Node.js 24.22.1 (`.nvmrc`) by evaluating `engines` ranges.

## 1. SPA libraries (D1)

D1 fixes React, Vite, Vitest, React Router, and TanStack Query, each at its latest version, which this item records. All are MIT, have npm provenance (SLSA v1) built from the tag's commit, and have no osv.dev record for the version below. Every repository had pushes in the week before 2026-10-25.

| Package and version | Published | Engines; peers | Upstream tag | Security route | Advisories and maintenance |
| --- | --- | --- | --- | --- | --- |
| `react@19.3.1`, `react-dom@19.3.1` (with `scheduler@0.28.0`) | 2026-10-14 | `react`: `node >=0.10.0`, no peers; `react-dom`: peer `react ^19.3.1` | [`v19.3.1`](https://github.com/react/react/tree/v19.3.1) (`61aa00df822d`); `facebook/react` redirects to `react/react` | [SECURITY.md](https://github.com/react/react/blob/v19.3.1/SECURITY.md): Meta's bug bounty page; PVR on | 29 releases in 12 months; no stated supported-version policy. Every recent repository advisory (for example GHSA-xqc2-xf4c-x3h3, critical, 2026-10-14) affects only the Server Components packages `react-server-dom-*`, which a client-only SPA does not install; 19.3.1 is the fixed line. |
| `vite@8.3.5` | 2026-10-21 | `node ^20.19.0 \|\| >=22.12.0`; optional peers only | [`v8.3.5`](https://github.com/vitejs/vite/tree/v8.3.5) (`981f07fa4580`) | [SECURITY.md](https://github.com/vitejs/vite/blob/v8.3.5/.github/SECURITY.md): PVR (on), with a threat model in which the dev and preview servers treat network input as hostile | 52 releases in 12 months; [supported versions](https://vite.dev/releases): regular patches for 8.3. Frequent dev-server advisories, most recently GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg, and GHSA-9jrq-w75r-8gcw (2026-10-06, fixed in 8.3.3); 8.3.5 is past every fix. |
| `vitest@5.0.5` | 2026-10-15 | `node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; required peer `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`; optional `jsdom`, `happy-dom` | [`v5.0.5`](https://github.com/vitest-dev/vitest/tree/v5.0.5) (`7a825db43e2b`) | [SECURITY.md](https://github.com/vitest-dev/vitest/blob/v5.0.5/SECURITY.md): PVR (on) | 37 releases in 12 months; [supported versions](https://vitest.dev/releases): 5.0 patched, 4.1 security. GHSA-p458-7748-mcp3 (2026-10-16) affects `@vitest/ui` and `@vitest/browser` below 5.0.5; the critical 2026 advisories concern browser mode and the UI server, which plain `vitest run` does not start **(unverified)**. |
| `react-router@8.5.0` | 2026-10-19 | `node >=22.22.0`; peers `react >=19.2.7`, optional `react-dom >=19.2.7` | [`react-router@8.5.0`](https://github.com/remix-run/react-router/tree/react-router%408.5.0) (`4fe452510287`) | [SECURITY.md](https://github.com/remix-run/react-router/blob/react-router%408.5.0/SECURITY.md): GitHub advisory form (PVR on); 8.x and 7.x supported | 34 releases in 12 months. The only advisory with a v8 range, GHSA-qwww-vcr4-c8h2 (RSC mode), is fixed in 8.3.0. Version 8 removed `react-router-dom`: `RouterProvider` comes from `react-router/dom` ([CHANGELOG](https://github.com/remix-run/react-router/blob/react-router%408.5.0/packages/react-router/CHANGELOG.md)). |
| `@tanstack/react-query@5.104.5` (with `@tanstack/query-core@5.104.5`) | 2026-10-19 | no engines; peer `react ^18 \|\| ^19` | [`@tanstack/react-query@5.104.5`](https://github.com/TanStack/query/tree/%40tanstack%2Freact-query%405.104.5) (`a8ecc8d42f82`) | **None documented**: no `SECURITY.md` in the repository or an organization `.github` repository, and PVR off | 75 releases in 12 months; no supported-version statement. The only repository advisory, GHSA-997g-27x8-43rf, affects `@tanstack/react-query-next-experimental` below 5.18.0, not this package. |

The tools D1 implies but does not name, as the author's proposal:

| Package and version | Published | Role | Facts |
| --- | --- | --- | --- |
| `@vitejs/plugin-react@6.1.2` | 2026-10-05 | React integration for Vite (JSX transform and Fast Refresh) | MIT; `node ^20.19.0 \|\| >=22.12.0`; peer `vite ^8.0.0`; one dependency; provenance; no osv record. Its repository's advisories affect only `@vitejs/plugin-rsc`. |
| `jsdom@30.1.3` | 2026-10-15 | DOM environment for the SPA's Vitest tests | MIT; `node ^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`; 20 dependencies; provenance; no osv record. The alternative `happy-dom@21.0.4` (MIT, provenance, 84 releases in 12 months) is not proposed: jsdom is the more conservative choice for standards behaviour **(unverified)**. |

Node 24.22.1 satisfies every engines range above, and React 19.3.1 satisfies every React peer range, including Mantine's (section 2).

**Author's proposal:** the exact versions in the two tables. Keep Vite and Vitest on their current minors, because their dev-server and test-server advisories are frequent, and never expose the Vite dev server beyond localhost; if `@vitest/ui` or browser mode is ever added, 5.0.5 is the floor.

## 2. Mantine (D17)

| Fact | `@mantine/core@9.7.3` and `@mantine/hooks@9.7.3` |
| --- | --- |
| Published | 2026-10-17 (core 12:30, hooks 12:28 UTC); previous 9.7.2 on 2026-10-11; 9.0.0 on 2026-03-31 |
| License | MIT ([LICENSE](https://github.com/mantinedev/mantine/blob/9.7.3/LICENSE)) |
| Peers | core: `react ^19.2.0`, `react-dom ^19.2.0`, `@mantine/hooks 9.7.3` (exact); hooks: `react ^19.2.0` |
| Dependencies | core: 5 (`clsx`, `type-fest`, `@floating-ui/react`, `react-number-format`, `react-remove-scroll`); hooks: none |
| Upstream | tag [`9.7.3`](https://github.com/mantinedev/mantine/tree/9.7.3) (`2d0a040f4201`, equal to `gitHead`); provenance from that commit |
| Security route | [SECURITY.md](https://github.com/mantinedev/mantine/blob/9.7.3/SECURITY.md): fixes only for the latest minor of the current major; PVR (on) or e-mail to the maintainer; response within 7 days |
| Advisories | none for either package. GHSA-54v8-pg45-q335 (2026-10-13) affects `@mantine/form` below 9.7.2, which D17 does not need |
| Maintenance | 38 releases in 12 months |
| Integrity | core `sha512-wYJ9Bd82a7HqwJ+hubFqUIocBGMuw6txzdPnnleHvv1h0NlnkESevK/WHTRh4FtOw33B5N2ADT34s3x1/8d8jg==`; hooks `sha512-GMHoMS1qul1dBLIHd/N9ef2Pr8UKYYHfuM+g2ej3gYqU0kH4sTiR9FNHksoTQi0PzATRoaNlUYjjMe9rbDRw5A==` |

This confirms the D17 observation: Mantine 9.7.3, MIT, with a security policy, requiring React `^19.2`. Because security fixes reach only the latest minor, item 28 keeps Mantine on the current minor.

## 3. Password hashing and sessions (D2)

D2 (a) makes sessions Taskelith-owned rows in PostgreSQL with password login, behind the `Access` adapter. The control-plane HTTP layer is plain `node:http` without a framework (`apps/control-plane/src/api/api-server.ts` at `b4b3885`), and `NodeSecrets` already issues secrets with `randomBytes`, stores their SHA-256, and compares with `timingSafeEqual` (`packages/adapters/secrets/src/node-secrets.ts`). Worktrees install with `npm ci --ignore-scripts`.

| Candidate | Version and facts | Security route | Advisories and maintenance |
| --- | --- | --- | --- |
| Node built-in `crypto.argon2` / `crypto.argon2Sync` | Added in Node v24.7.0 ([release](https://github.com/nodejs/node/releases/tag/v24.7.0)); no stability marker of its own, so the module's "Stability: 2 - Stable" applies ([crypto.md at v24.22.1](https://github.com/nodejs/node/blob/v24.22.1/doc/api/crypto.md#cryptoargon2algorithm-parameters-callback)); compiled only with OpenSSL 3.2 or later ([ncrypto.h](https://github.com/nodejs/node/blob/v24.22.1/deps/ncrypto/ncrypto.h#L94-L98)). Returns the raw tag only: no PHC string encoding, verification from an encoded string, or default parameters. Exercised under Node 24.22.1 (OpenSSL 3.5.9) on macOS x86_64 and in `ubuntu:24.04` with the official tarball: argon2id with m=19456, t=2, p=1 works, and the RFC 9106 section 5.3 argon2id test vector matched. | Node.js [SECURITY.md](https://github.com/nodejs/node/blob/v24.22.1/SECURITY.md): HackerOne | Covered by Node's security process; Node 24 reaches end of life on 2028-04-30 ([schedule](https://github.com/nodejs/Release/blob/de0b20f409ba90dcde129b4bfb85b47c3c422ecb/schedule.json)). No dependency or native add-on. |
| `@node-rs/argon2@2.2.2` | 2026-10-06; MIT; `node >= 10`; no dependencies and no install script; 13 platform packages, including darwin-arm64, darwin-x64, and linux x64 and arm64 glibc, each with provenance; Rust napi-rs add-on; `hash`/`verify` with PHC strings. Loaded under `--ignore-scripts` on macOS x86_64 and Ubuntu 24.04 x86_64; defaults m=19456, t=2, p=1. Tag `@node-rs/argon2@2.2.2` ([`b706e3035f5d`](https://github.com/napi-rs/node-rs/tree/b706e3035f5d4d487ae66ea0549a041cd509e5d4)). | [SECURITY.md](https://github.com/napi-rs/node-rs/blob/b706e3035f5d4d487ae66ea0549a041cd509e5d4/SECURITY.md): Tidelift security contact only; PVR off | No advisory for any version. Four releases in 12 months after a 20-month gap; one npm maintainer. |
| `argon2@0.45.1` (node-argon2) | 2026-07-21; MIT; four dependencies; install script `node-gyp-build`. Prebuilt binaries for linux x64 and arm64 and darwin-arm64, **but none for darwin-x64** since 0.45.0 ([release workflow](https://github.com/ranisalt/node-argon2/blob/786de7152f95881b0683aea1d2ca60ed0d6d9e2f/.github/workflows/release.yml#L32-L41)); under `--ignore-scripts` it failed to load on macOS x86_64 ("No native build was found") and loaded on Ubuntu 24.04 x86_64. | No `SECURITY.md`; PVR on | No advisory for any version. Two releases in 12 months; one npm maintainer. |
| `cookie@2.0.1` (jshttp) | 2026-06-30; MIT; `node >=22`; no dependencies; ESM only, with `parseCookie` and `stringifySetCookie`; provenance; tag [`v2.0.1`](https://github.com/jshttp/cookie/tree/51c485421a95ee796de6d8dab53a5ade0a20db8a) | [Organization policy](https://github.com/jshttp/.github/blob/HEAD/SECURITY.md), which refers to the Express policy: GitHub advisory form (PVR on) or `express-security@lists.openjsf.org` | No osv record for 2.0.1; the only advisory, GHSA-pxg6-pf52-xh8x (low), was fixed in 0.7.0. Four releases in 12 months; three npm maintainers. |

No session library is needed: session libraries such as `express-session` assume a framework the control plane does not use, and D2 (a) keeps sessions in Taskelith's own tables.

**Author's proposal:**
- Hash with the built-in `crypto.argon2` (argon2id, no weaker than the [OWASP minimum](https://github.com/OWASP/CheatSheetSeries/blob/3c07d4aa45a33ffc6a68408621064942358dee61/cheatsheets/Password_Storage_Cheat_Sheet.md#L11) of m=19456 KiB, t=2, p=1), with a small, fully tested PHC string encoder and parser in the `Access` adapter, verification by `timingSafeEqual`, a rehash when stored parameters fall below the current ones, and a startup check that fails clearly when `crypto.argon2` is missing (a Node built against an OpenSSL older than 3.2). It adds no dependency and works under `--ignore-scripts`. Item 10's reviewer checks the encoder against architecture section 7, which forbids custom cryptography; the encoder only formats parameters and bytes.
- Fallback, if the owner prefers a library to own encoding and verification: `@node-rs/argon2@2.2.2`, with its single maintainer and Tidelift-only route recorded.
- Not proposed: `argon2@0.45.1`, because it cannot load on Intel macOS under `--ignore-scripts`.
- Sessions: opaque tokens issued like `NodeSecrets` (`randomBytes(32)`, SHA-256 stored form, `timingSafeEqual`) in PostgreSQL rows, sent as a `__Host-` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`, following the [OWASP session guidance](https://github.com/OWASP/CheatSheetSeries/blob/cec51594b191eec97ec36f93d1e08c7945dfe598/cheatsheets/Session_Management_Cheat_Sheet.md#L157-L163), with `cookie@2.0.1` for parsing and serialization.

## 4. The `git` CLI (D3)

| Fact | Value |
| --- | --- |
| Upstream | v2.56.0, tagged 2026-09-28 ([tag](https://github.com/git/git/tree/v2.56.0), commit `a018953688f1`); five feature releases in 12 months (2.52.0 to 2.56.0) and one maintenance release, 2.51.2 (2025-10-27, no security content) |
| License | GPL-2.0-only ([COPYING](https://github.com/git/git/blob/v2.56.0/COPYING)); Taskelith calls it as an external program and does not link it |
| Support | [SECURITY.md](https://github.com/git/git/blob/v2.56.0/SECURITY.md): no long-term support versions; critical fixes reach the latest maintenance track and "at least a couple more" |
| Security route | git-security@googlegroups.com, as SECURITY.md states |
| Advisories | None published between 2025-10-25 and 2026-10-25. The latest set, 2025-07-08 (GHSA-vwqx-4fm8-6qc9 / CVE-2025-48384 and GHSA-m98c-vgpc-9655 / CVE-2025-48385, high, and the Windows-only CVE-2025-48386), was fixed in 2.50.1 and backported down to 2.43.7. CVE-2024-52005 (GHSA-7jjc-gg6m-3329, sideband output passed to the terminal) is patched only in Git for Windows, not in core git |
| Ubuntu 24.04 | `1:2.43.0-1ubuntu7.4` ([Launchpad](https://launchpad.net/ubuntu/+source/git/1:2.43.0-1ubuntu7.4)), published to noble-security on 2026-10-19; Canonical backported the 2024 and 2025 security fixes in USN-6793-1, USN-7207-1, and USN-7626-1; UBUNTU-CVE-2024-52005 has no fixed version. `apt-cache policy git` in `ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac` showed this version as the candidate |
| macOS | Xcode 26.5 and the Command Line Tools 26.6 ship `git version 2.50.1 (Apple Git-155)`, observed on macOS 26.6.2 x86_64. Homebrew's `git` is 2.56.0 with bottles for Apple Silicon and Linux only, so it builds from source on Intel macOS ([formula](https://formulae.brew.sh/api/formula/git.json)) |
| Local observation | On the owner's Mac, `/usr/local/bin/git` 2.33.0 comes first in `PATH`; it predates the fixes for CVE-2022-41903 and later advisories |

**Author's proposal:** pin `git=1:2.43.0-1ubuntu7.4` in the Linux worker image on the digest-pinned base, and Apple's `/usr/bin/git` (2.50.1, Apple Git-155) on macOS. The adapter calls git through the explicit path recorded in the worker's tool manifest, never the first `git` in `PATH`, and accepts only the recorded version strings until they are requalified. A version gate that compares upstream numbers would reject Ubuntu's patched 2.43.0 build, so the pin is the exact package version per platform. Reproducible image builds need the exact apt version and the Ubuntu snapshot archive, because the archive keeps only the current noble-updates and noble-security versions **(unverified)**. Upstream 2.56.0 through the git-core PPA would trade Canonical's backports for a third-party archive and is not proposed.

## 5. Claude Agent SDK and CLI (D5)

The register pins `@anthropic-ai/claude-agent-sdk@0.3.308` with bundled CLI 2.1.308 ([qualification](qualification/claude-code.md)). This item records the latest facts; moving the pin is the decision of item 19.

| Fact | Value |
| --- | --- |
| Latest | `0.3.310`, published 2026-10-23T21:21Z, bundling CLI 2.1.310 (`claudeCodeVersion` in its `package.json`); only `0.3.309` lies between the pin and it. The CLI's `stable` dist-tag is 2.1.308 and `latest` is 2.1.310 |
| License | `SEE LICENSE IN README.md`; LICENSE.md: "© Anthropic PBC. All rights reserved", use subject to Anthropic's [legal agreements](https://code.claude.com/docs/en/legal-and-compliance); the README links the Commercial Terms and the Privacy Policy. Proprietary, as the register already records |
| Packaging | No dependencies; peers `@anthropic-ai/sdk >=0.93.0`, `@modelcontextprotocol/sdk ^1.29.0`, `zod ^4.0.0`; the CLI is a native executable in eight `os`/`cpu`/`libc`-selected optional platform packages, covering darwin-arm64, darwin-x64, and linux x64 and arm64 glibc; `manifest.json` lists a SHA-256 for each platform binary. No install script in the SDK or those four platform packages. Engines `node >=18.0.0` |
| Integrity | 0.3.310 `sha512-fo+sr+9Ks73P001f6XKRQlyzfIBAJMgXArLUkH5Tu98NikRDZeGtFQVj23d5/hj2ijpFgzffrr4fHywY9qUkoQ==` (recomputed from the packed tarball); 0.3.308 `sha512-oda1EZ4wjculEQWjakYSEM12qiB4hU2jgMEhg9bvNhW++tvp8CKZ9ad6gVAl3psADktEg6C8MYGlfNpvnO47Ug==`. No npm provenance on the SDK, its platform packages, or `@anthropic-ai/claude-code` |
| Upstream | [`anthropics/claude-agent-sdk-typescript` v0.3.310](https://github.com/anthropics/claude-agent-sdk-typescript/tree/v0.3.310) holds documentation and examples, not the SDK source |
| Security route | Anthropic's HackerOne programme, per [claude-code SECURITY.md](https://github.com/anthropics/claude-code/blob/v2.1.310/SECURITY.md) and `https://www.anthropic.com/.well-known/security.txt`; the SDK repository has no `SECURITY.md`; PVR off on both repositories |
| Advisories | None for the SDK. `@anthropic-ai/claude-code` has 35 repository advisories, all fixed; the highest fixed version is 2.1.260 (GHSA-gfvf-j8jh-jxxw) and the most recent high one, GHSA-pq7j-f95f-qfcv, was fixed in 2.1.179. None affects 2.1.308 or 2.1.310 |
| Maintenance | 310 SDK releases in 12 months, 26 in the last 30 days; 15 npm maintainers, all at anthropic.com |

The `sdkCompat.testedWrapperVersions` list in the 0.3.310 manifest ends at 0.3.306; its meaning is not documented.

## 6. GitHub API client

The GitHub qualification called the REST API with GitHub App credentials and `X-GitHub-Api-Version: 2022-11-28` ([qualification](qualification/github.md)) and named no client library. GitHub [recommends Octokit.js](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/rest/guides/scripting-with-the-rest-api-and-javascript.md#L16). `GET /versions` returns `2026-03-10` and `2022-11-28`; 2022-11-28 reaches end of support on 2028-03-10, after which a request for it returns `410 Gone` ([versions table](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/data/tables/rest-api-versions.yml), [API versions](https://github.com/github/docs/blob/02c25d16369fe27f9bdb28d1201f6b452f0d21dd/content/rest/about-the-rest-api/api-versions.md#L37-L51)).

All Octokit packages below are MIT, declare `node >= 20`, have provenance, and have no osv record for the version; PVR is on, and SECURITY.md defers to [GitHub's policy](https://github.com/github/.github/blob/b26f54aaadb098273789b874ce198c6b3972021d/SECURITY.md) (opensource-security@github.com).

| Package and version | Published | Releases in 12 months | Upstream tag |
| --- | --- | --- | --- |
| `@octokit/core@7.0.8` | 2026-08-30 | 3 | [`v7.0.8`](https://github.com/octokit/core.js/tree/v7.0.8) |
| `@octokit/auth-app@8.3.1` | 2026-09-01 | 4 | [`v8.3.1`](https://github.com/octokit/auth-app.js/tree/v8.3.1) |
| `@octokit/plugin-paginate-rest@16.0.0` | 2026-09-28 | 3 | `gitHead` `6c2cd8f21dca` |
| `@octokit/webhooks-methods@6.0.0` | 2025-05-20 | 0 | no dependencies |
| `@octokit/webhooks@14.2.0` | 2025-12-03 | 1 | [`v14.2.0`](https://github.com/octokit/webhooks.js/tree/v14.2.0) |
| `octokit@5.0.5` (meta package) | 2025-10-31 | 1 | [`v5.0.5`](https://github.com/octokit/octokit.js/tree/v5.0.5); 63 packages in its tree; pins older plugin majors |
| `@octokit/rest@22.0.1` | 2025-10-31 | 1 | [`v22.0.1`](https://github.com/octokit/rest.js/tree/v22.0.1); pins older plugin majors |

The 2025 Octokit advisories (GHSA-rmvr-2pp2-xj38, GHSA-h5c3-5r3r-rr8q, GHSA-xx4v-prfh-6cgc, and GHSA-x4c5-c7rf-jjgv, moderate ReDoS) and the 2023 webhooks advisory GHSA-pwfr-8pq7-x9qv were fixed before the current majors. `@octokit/plugin-retry@8.1.1` and `@octokit/plugin-throttling@11.0.5` depend on `bottleneck@2.19.5`, last published 2019-08-03. `universal-github-app-jwt@2.2.2`, which `auth-app` uses for the App JWT, has no provenance. Octokit does not set `X-GitHub-Api-Version` by default ([request.js README](https://github.com/octokit/request.js/blob/723070ed2892a202f94d2e328ef81300c09ffb94/README.md)). Plain `fetch` (stable since Node 21) adds no dependency, but Taskelith would then own installation-token caching and refresh, pagination, rate-limit back-off, and error mapping.

**Author's proposal:** inside the GitHub SCM plugin, `@octokit/core@7.0.8` with `@octokit/auth-app@8.3.1` as the authentication strategy (per-installation tokens narrowed by repository and permission, cached and refreshed) and `@octokit/plugin-paginate-rest@16.0.0`; webhook signatures verified on the raw body with `@octokit/webhooks-methods@6.0.0`, with event routing owned by the plugin. Set `X-GitHub-Api-Version: 2022-11-28` explicitly in the request defaults. Leave out the meta package, `@octokit/rest`, and the retry and throttling plugins (and with them `bottleneck`) until a later gate measures a need. Plan a requalification against API version 2026-03-10 before 2028-03-10.

## 7. Web terminal: xterm.js and node-pty (D18)

| Package and version | Published | Facts | Security route | Advisories and maintenance |
| --- | --- | --- | --- | --- |
| `@xterm/xterm@6.0.0` | 2025-12-22 | MIT; no engines, dependencies, or install script; no provenance; tag [`6.0.0`](https://github.com/xtermjs/xterm.js/tree/6.0.0) (`f447274f430f`, equal to `gitHead`). The old `xterm` package is deprecated in its favour (last release 5.3.0) | No `SECURITY.md`; PVR off | No advisory for `@xterm/xterm`. One stable release in 12 months; 6.1.0 betas continue (latest 2026-10-13); one npm maintainer |
| `@xterm/addon-fit@0.11.0`, `@xterm/addon-attach@0.12.0`, `@xterm/addon-web-links@0.12.0` | 2025-12-22 | MIT; no dependencies or peers; released from the same commit as `@xterm/xterm@6.0.0` | As above | No advisory |
| `node-pty@1.1.0` | 2025-12-22 | MIT; one dependency, `node-addon-api ^7.1.0` (Node-API, not NAN); install script `node scripts/prebuild.js \|\| node-gyp rebuild`; prebuilt binaries for darwin-arm64, darwin-x64, and Windows only, **none for Linux**, so on linux-x64 and linux-arm64 it compiles with node-gyp, Python, make, and a C++ toolchain; no provenance; tag [`v1.1.0`](https://github.com/microsoft/node-pty/tree/v1.1.0) (`1def57746323`). Node 24 support is not stated **(unverified)** | Microsoft [SECURITY.md](https://github.com/microsoft/node-pty/blob/v1.1.0/SECURITY.md): MSRC; PVR on | No advisory for any version. One stable release in 12 months; `1.2.0-beta.18` (2026-10-23) adds linux-x64 and linux-arm64 binaries built against glibc 2.28 |

Forks with Linux binaries exist: `@homebridge/node-pty-prebuilt-multiarch@0.14.1` (2026-07-23, MIT, provenance, downloads macOS binaries from GitHub releases during installation) and `@lydell/node-pty@1.2.0-beta.18` (2026-10-24, MIT, a single-maintainer repackaging of the upstream beta into platform packages without an install script). Neither is proposed, because each adds a third-party distributor or a prerelease to the worker's native code.

**Author's proposal:** `@xterm/xterm@6.0.0` with `@xterm/addon-fit@0.11.0` for the terminal view inside the Mantine layout; the attach addon is not proposed, because item 39's WebSocket carries its own authentication and framing. On the worker, `node-pty@1.1.0`: its prebuilt binaries on macOS, and on Linux a compile in a build stage of the worker image, with the toolchain kept out of the runtime stage. Repository installs use `npm ci --ignore-scripts`, so item 39 must run node-pty's build step explicitly. Revisit when a stable 1.2.0 ships Linux binaries.

## 8. Findings for the coordinator

None of the decided options is unsuitable: every component evaluated is under an OSI-approved license except the Claude Agent SDK, whose proprietary terms the register already records; none has an advisory open at the version evaluated; none is abandoned. These findings need attention in later items:

1. `node-pty@1.1.0` has no Linux binaries, as D18 anticipated; item 39 compiles it for both Linux matrix entries.
2. `@tanstack/react-query` documents no private security route. D1 stands; the gap is recorded, and advisories are followed through osv.dev and the GitHub advisory database.
3. GitHub REST API version 2022-11-28, which ADR 0006 and the qualification use, reaches end of support on 2028-03-10; version 2026-03-10 exists.
4. Ubuntu 24.04's git is 2.43.0 with Canonical's backports; CVE-2024-52005 is unfixed in core git.
5. `crypto.argon2` needs Node 24.7.0 or later built with OpenSSL 3.2 or later; the pinned official 24.22.1 binaries meet this.

## Remaining before admission

Each component stays `candidate` until the item that installs it adds the architecture's version-specific evidence: exact pins in the lockfile with integrity, independent adoption of the pinned version, operational, upgrade, and recovery evidence, and, for native code (`node-pty`, the Claude Code platform binaries), builds or loads on every worker matrix entry. Upstream facts change after 2026-10-25; each installing item rechecks versions and advisories before pinning.
