# G2 infrastructure evaluation

Date: 2026-10-25. Status: evaluation for item 1 of the [G2 work plan](g2-plan.md) (`qualify-g2-infrastructure`). Documentation only: no package, image, or service was installed into the repository, added to `package.json`, a lockfile, Compose, or the Makefile, or run against Taskelith code; installation is item 9. The owner decided D1, D2, D4, D6, and D8 on 2026-10-25 ([G2 plan](g2-plan.md#owner-decisions)); this evaluation records evidence for the decided options and does not reopen them. Where a decision leaves a tool open (the PostgreSQL driver and migration tool under D6, the NATS client under D2 and D3, the image variant under D1 and D2), the recommendation is the **author's proposal**. Admission follows the [dependency policy](architecture.md#established-open-source-technology-policy); every component below stays `candidate` in the [register](dependencies.md#g2-infrastructure).

## Evidence and markers

All observations were made on 2026-10-25. Package facts (version, publication date, license, engines, dependencies, integrity) come from the npm registry; image digests come from `docker buildx imagetools inspect <image>:<tag>` against Docker Hub and ghcr.io; advisories come from osv.dev, the GitHub advisory database, and each project's own advisory page. These are unversioned services, and tag digests move when an image is rebuilt (the `postgres` images were rebuilt on 2026-10-21 from the same source commit), so the digests below are the pins, not the tags. Upstream documents and source are cited at a release tag or full commit in [Sources](#sources). "Private reporting" records whether GitHub private vulnerability reporting is enabled, an unversioned repository setting.

- **(unverified)** marks a claim about runtime behaviour taken only from documentation or source. Sections 1 to 7 carry it for every runtime and capability claim they make, except the `node:sqlite` checks in section 4, which were run under Node 24.22.1. Registry metadata, digests, advisory records, and statements read from a document are cited facts.
- Adoption is labeled **verified** when the adopter's `package.json` was read at a pinned commit. It does not establish independent adoption of the exact pinned version.
- Each image is pinned by its multi-arch index digest; the `linux/amd64` and `linux/arm64` manifest digests are listed so that a platform pull can be checked against the index.

## 1. PostgreSQL server and image (D1)

| Fact | Value |
| --- | --- |
| Version | PostgreSQL 18.6, released 2026-08-13; 18.5 was never released because of a regression found after wrap, so 18.6 follows 18.4. Its migration notes name steps after an update from earlier 18 releases: configuration adjustments and data cleanups for three security fixes, a check of possibly corrupt `reltuples` values for tables with GIN indexes, and reindexing of `btree_gist` and `ltree` indexes. |
| Support | Major version 18: first release 2025-09-25, final release 2030-11-14 (versioning policy). |
| License | PostgreSQL License. |
| Security route | security@postgresql.org (security page); private reporting is enabled on `docker-library/postgres`; image-level reports go to the image maintainers, doi@docker.com, or the `docker-library/official-images` advisory form (its `SECURITY.md`). |
| Advisories | 18.6 fixes 28 CVEs (highest CVSS 8.8, among them CVE-2026-16238 and CVE-2026-16239 in the server); no CVE on the security page lists 18 as affected beyond 18.6. PostgreSQL publishes no list of known unfixed issues, so this means only that none is published. |
| Maintenance | Quarterly minor releases on the versioning policy; PostgreSQL 19 is at release candidate 1. |
| Image | Docker Official Image `postgres:18.6-trixie` (Debian 13 slim base), built from `docker-library/postgres` commit `e00e1bd34ec5c8a8e7ad89b273b3d42efaf6d5bc`, as `library/postgres` at `official-images` commit `1b851c635e09` defines it. |
| Index digest | `sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` |
| `linux/amd64` | `sha256:9770878138a2e83abcb10856d30cc3f24dae0d317bb956db6ab9159de6c3c80d` |
| `linux/arm64` | `sha256:a8be76d23699a6c366437e9f80ead007975f24c35e01c9ee0533c6930ab57ac1` |
| Image licenses | The image also contains base-distribution software under other licenses; the image documentation makes compliance the user's responsibility and points to `docker-library/repo-info` for the package inventory. |

Other variants observed: `postgres:18.6-bookworm` (index `sha256:bbf83594798e144bff365a9c191c5d779f181fb3135902064ab8ff11918020fc`) and `postgres:18.6-alpine3.24` (index `sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5`), both from the same source commit.

**Proposal:** `postgres:18.6-trixie` by its index digest. It is the Debian variant the `18`, `latest`, and `trixie` tags point to, and Debian's glibc locale and collation behaviour is the upstream default, where Alpine's musl differs **(unverified)**. The 18.6 migration steps concern updates of existing 18 installations, not a fresh database.

## 2. NATS server and image (D2)

| Fact | Value |
| --- | --- |
| Version | nats-server v2.15.1, released 2026-10-09; v2.15.0 was released 2026-09-17 and includes every change up to v2.14.7. The maintained previous line is at v2.14.8, released the same day. |
| Support | `RELEASES.md`: a six-month release cycle since 2.11, and "the current and previous minor series are supported" with bug fixes and security patches, so 2.15 and 2.14 today. |
| License | Apache-2.0. |
| Security route | `SECURITY.md` refers to the organisation policy: the GitHub advisory form of the repository (private reporting enabled), or security@nats.io; advisories are published at advisories.nats.io. |
| Advisories | 38 repository advisories; none lists 2.15.x as affected. The latest batch (2026-06-29, 13 advisories) affects at most 2.14.2 and is fixed in 2.15.0; GHSA-g33f-6538-grxh (Go `nkeys` up to 0.4.15) is fixed by the `nkeys` v0.4.16 that v2.15.1 pins. osv.dev returns no vulnerability for 2.15.1. |
| Maintenance | 30 stable releases across the 2.11, 2.12, 2.14, and 2.15 lines in the twelve months before observation; last commit on `main` on 2026-10-20; 457 open issues and 50 open pull requests. |
| Image | Docker Official Image `nats:2.15.1-alpine` (Alpine 3.22 base), built from `nats-io/nats-docker` commit `57332cb1aea214fbf8aca7683ffae4c5751c0409`, as `library/nats` at `official-images` commit `e0a2ea14d061` defines it. |
| Index digest | `sha256:7ae34c25dfd6fe2e01c6483eabef20d796690fdcac6c4d94ca780a6cf9877fde` |
| `linux/amd64` | `sha256:76a3659dd4c61c32ab7d68c485e2ccb84861a5f1d7d6ba2f9be80b506d0ab7e6` |
| `linux/arm64` | `sha256:19c6c31ec229c4f9cef92d011761bf3be6e2842d8f6b14f22ce7e8567b0273cf` |

The scratch variant `nats:2.15.1-scratch` (index `sha256:8f8ed346c804fdee1c675071adacd51e7b53c4417cf67f3c8f8ea593348d4605`; `linux/amd64` `sha256:fa1b31eb7aad82a03511b3df200f2b7a0c8e740f001f7abe52d28c9619a209b5`, `linux/arm64` `sha256:8275494ca7c156c2f709e789867b6e6deb0c5ccb872f9dd50ba8b1b2c74106ba`) contains only the server binary, copied from the Alpine build; the shared tag `nats:2.15.1` adds a Windows image to the same Linux manifests. The bundled configuration has no `jetstream` block, so JetStream is off by default; the image documentation enables it with `-js` and a store directory. Because the entrypoint is the server binary, passing arguments replaces the default `--config nats-server.conf` command **(unverified)**; item 9 should mount its own configuration with a `jetstream {}` block instead.

**Proposal:** `nats:2.15.1-alpine` by its index digest. The server binary is the same as in the scratch variant; the Alpine variant adds a shell and BusyBox `wget`, which a Compose health check of the monitoring endpoint (`/healthz` on port 8222) can call, and its Dockerfile verifies the release tarball's SHA-256 **(unverified)**. If item 9 checks health from outside the container, the scratch variant is the smaller choice.

## 3. NATS JavaScript client

| Package and version | Facts |
| --- | --- |
| `@nats-io/transport-node@3.4.0` | Apache-2.0; `node >= 18.0.0`; published 2026-05-08; depends on `@nats-io/nats-core@3.4.0`, `@nats-io/nkeys@2.0.3`, and `@nats-io/nuid@3.0.0`; ships `.d.ts` files; npm provenance. |
| `@nats-io/jetstream@3.4.0` | Apache-2.0; no engine declared; depends on `@nats-io/nats-core@3.4.0`; ships `.d.ts` files, although its `types` field names `./lib/mod.d.js`, an apparent upstream typo (the same in `nats-core`); TypeScript resolution through `exports` is **(unverified)**. |
| `@nats-io/nats-core@3.4.0` | Apache-2.0; no engine declared; depends on `@nats-io/nkeys@2.0.3` and `@nats-io/nuid@3.0.0`. |

All three come from `nats-io/nats.js` tag `v3.4.0` (commit `95e76e79d9feaa0a0bf3b0e8da526ec5a3460979`, the npm `gitHead`). The legacy `nats` package (2.29.3) is deprecated on npm in favour of `@nats-io/transport-node`, and its repository `nats-io/nats.node` is archived.

- **Security route:** no `SECURITY.md` in `nats.js` and private reporting off; the organisation policy applies, which in practice means security@nats.io. No advisory exists for any of the packages or their `@nats-io` dependencies on osv.dev.
- **Maintenance:** stable releases 3.3.0 (2025-12-16), 3.3.1 (2026-02-11), and 3.4.0 (2026-05-08), with a `3.4.1-0` pre-release (2026-05-13), so no stable release for about five months; the last commit on `main` was on 2026-10-23 (a connection race fix); 12 open issues.
- **Server compatibility:** no document or source at `v3.4.0` mentions nats-server 2.15. Feature gates in `core/src/semver.ts` require 2.11.0 for priority groups and batched direct get, and 2.14.0 for consumer reset; the client implements pull consumers (`fetch` and `consume`), consumer pause and resume, and priority groups **(unverified)**. Its Node CI matrix is only 25.x, against the latest server release without a pinned version, so Node 24 and 2.15 are not covered by upstream CI.
- **Adoption (verified):** `@graphql-hive/pubsub` (peer dependency on `@nats-io/jetstream` and `@nats-io/nats-core` ^3) and `@testcontainers/nats` (development dependency on `@nats-io/jetstream` and `@nats-io/transport-node` ^3.4.0).

**Proposal:** the three packages above at 3.4.0, exact-pinned. They are the official client and the only maintained one; item 2's spike must establish 2.15 compatibility on Node 24.22.1 before item 12 depends on it.

## 4. SQLite bindings (D4)

**`node:sqlite` in Node 24.22.1 (decided option).** Node 24.22.1 (tag commit `ce7aaf1cee78b8cf0ce17364260535c418d3ed26`, a security release dated 2026-10-20) documents the module as "Stability: 1.2 - Release candidate" since v24.15.0, without a flag. It bundles SQLite 3.53.4 (`deps/sqlite/sqlite3.h`, source ID dated 2026-07-24). Run on 2026-10-25 under Node 24.22.1: `require("node:sqlite")` loads without a warning, `process.versions.sqlite` and `select sqlite_version()` report 3.53.4, `PRAGMA journal_mode=WAL` returns `wal`, `PRAGMA synchronous=FULL` reads back as 2, and `sqlite.backup` is a function.

- **API for a journal:** `DatabaseSync` with `defensive` on by default since v24.14.0, `allowExtension` off by default, `timeout` (busy timeout, default 0), and `enableForeignKeyConstraints` on by default; `exec` for `BEGIN`, `COMMIT`, and `ROLLBACK`; `isTransaction`; and the asynchronous `sqlite.backup` over the SQLite online backup API **(unverified beyond the checks above)**.
- **Licenses:** Node is MIT; SQLite is in the public domain. Node's `LICENSE` at the tag has no SQLite entry.
- **Security route:** Node reports go to HackerOne (`SECURITY.md`); SQLite publishes CVEs on its CVE page and hardening guidance, but no private reporting channel was found **(unverified)**.
- **Advisories:** the SQLite CVE page (updated 2026-08-01) lists nothing unfixed in 3.53.4; its latest entries (CVE-2026-11822 and CVE-2026-11824, FTS5 heap overflows that need arbitrary SQL with defensive mode off) are fixed in 3.53.2. Upstream SQLite is at 3.54.1 (2026-10-16). The Node 24.22.1 release fixes eight CVEs, none in SQLite.
- **Maintenance:** Node 24 is an LTS line; a SQLite update reaches Taskelith only with a Node update.

**`better-sqlite3@13.0.3` (fallback).** MIT; `node >= 22`; published 2026-08-05 from tag `v13.0.3` (commit `dbc2ea1165fef1f599b9be12faea33fa5e9d7ffb`, the npm `gitHead`) with npm provenance; one dependency, `node-addon-api ^8.0.0`. Since 13.0.0 it no longer uses `prebuild-install` or `bindings`: the npm tarball (27.3 MB unpacked) carries N-API 10 prebuilt binaries for `linux-x64`, `linux-arm64`, `linuxmusl-x64`, `linuxmusl-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`, and `win32-arm64`, and it has no install script, so a platform without a prebuilt binary may not compile automatically **(unverified)**. It bundles the same SQLite 3.53.4. No `SECURITY.md`, private reporting off, and no advisory on osv.dev or GitHub. 23 releases in the twelve months before observation, last push 2026-08-10, 59 open issues. Adoption (verified): `drizzle-orm` 0.45.4 declares it as an optional peer dependency. Its prebuilt binaries were listed, not loaded.

**Proposal:** no change to D4. `better-sqlite3@13.0.3` stays the fallback; both bundle the same SQLite, so the fallback changes the binding, not the storage engine. Item 14's durability tests decide whether the fallback is needed.

## 5. PostgreSQL driver (D6)

`pg@8.23.1` (node-postgres): MIT; `node >= 16.0.0`; published 2026-09-30 from tag `pg@8.23.1` (commit `0980cefebe0ae461da8883703be049fe13ca96cf`, the npm `gitHead`); lockfile-relevant integrity `sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==`. Direct dependencies `pg-pool`, `pg-protocol`, `pg-types`, `pg-connection-string`, and `pgpass`, optional `pg-cloudflare`, and an optional peer `pg-native`; 14 packages in a resolved tree. It ships no types; `@types/pg@8.23.1` (MIT, 2026-08-17) provides them.

- **Security route:** no `SECURITY.md`; private reporting enabled.
- **Advisories:** one historical advisory, GHSA-wc9v-mj63-m9g5 (CVE-2017-16082, remote code execution, fixed in 7.1.2 and earlier lines); none affects 8.23.1 or its dependencies on osv.dev.
- **Maintenance:** ten releases in the twelve months before observation (8.17.0 to 8.23.1); last commit on `master` on 2026-10-23; 459 open issues and 108 open pull requests.
- **Adoption (verified):** `n8n` 2.45.0 depends on `pg` (catalog version 8.21.0); `directus` lists it as an optional dependency.

**Proposal:** `pg@8.23.1` with `@types/pg@8.23.1`, exact-pinned, without `pg-native`. It states SQL directly, as D6 (a) requires, and the migration tool proposed below uses it as its driver.

## 6. Versioned SQL migration tool (D6)

All behaviour in this section is read from documentation or source at the cited tags **(unverified)**.

| Tool and version | Facts | Assessment |
| --- | --- | --- |
| `node-pg-migrate@9.0.0` | MIT; `node >= 20.11.0`; 2026-07-17, tag `v9.0.0`; dependencies `glob`, `jiti`, `yargs`; peer `pg >=4.3.0 <9.0.0` (8.23.1 fits) and optional `@types/pg`. Plain `.sql` files with `-- Up Migration` and `-- Down Migration` markers. All pending migrations run in one transaction by default (`--no-single-transaction` for one each; `pgm.noTransaction()` opts out). Advisory lock on by default (`pg_try_advisory_lock`, fail mode). Down migrations. No content checksum; `check-order` checks order only. No security policy; private reporting off; no advisory. One stable release and many 10.0.0 alphas in twelve months; last commit 2026-10-23; 17 open issues. | **Proposal: select.** Uses the same `pg` driver, locks against concurrent runs by default, runs in-process from the control plane's composition root or a `make` target, and needs no extra image. Gaps: no checksum of applied files, pre-1.0 alpha line in parallel. |
| dbmate `v2.37.0` | MIT; Go binary; 2026-10-18; image `ghcr.io/amacneil/dbmate:2.37.0`, index `sha256:0101fcc9999596f4a6930e5627296cd91f3bfa225e3e8c1699fc00881e439cc6` (`linux/amd64` `sha256:463a72f3a1407fd9379fee8f5e18cd2d8ac86dd4e740b47fb8d9b4bd7b560e30`, `linux/arm64` `sha256:883960aa591492eea351359d0b0ce52e68550f19bb64cf690b4344648df5d33e`). Plain SQL with `-- migrate:up` and `-- migrate:down`, one transaction per file, advisory lock only with `--migration-lock`, no checksum, down migrations. No security policy; private reporting off; no advisory. 16 releases in twelve months. | Runner-up: the most active, and digest-pinnable as a container, but it runs outside the TypeScript application, its lock is opt-in, and it adds an image to every installation. |
| `graphile-migrate@1.4.1` | MIT; 2022-12-20; 2.0.0 at release candidate 6 (2026-10-14). Roll-forward SQL with hashes of committed migrations, advisory try-lock, no down migrations. Organisation security policy (email, latest release only); private reporting on. | Not proposed: no stable release for almost four years. |
| `postgrator@8.0.0` with `postgrator-cli@10.0.0` | MIT; 2024-11-11 (core). MD5 checksums of SQL files, no lock, no transaction management. | Not proposed: core unchanged since 2024-11 and no lock. |

Flyway (Apache-2.0 repository, 13.11.1) and Sqitch (MIT, v1.6.1) were noted from release metadata only and not evaluated: both add a non-Node runtime.

**Proposal:** `node-pg-migrate@9.0.0`, exact-pinned, with SQL-only migration files and one transaction per migration file (`--no-single-transaction`), so that a migration that cannot run in a transaction can opt out alone. The missing checksum is a gap that item 11 closes or records: for example, a check that compares applied migration names with the files and fails on an edited applied file.

## 7. Partition proxy (D8)

Toxiproxy v2.13.0: MIT; released 2026-10-14 from tag `v2.13.0` (commit `ff428b0e2c46af894c55711c2a3e427fce6b1ef2`); previous releases 2025-03-18 and 2024-10-16. Image `ghcr.io/shopify/toxiproxy:2.13.0` (no `v` prefix), whose `org.opencontainers.image.revision` is the tag commit:

| Index digest | `linux/amd64` | `linux/arm64` |
| --- | --- | --- |
| `sha256:5d3dae09bc185dcc5ff6cf43abf6062a4a720aff0c4306a471e773acdcd107aa` | `sha256:9941f0357759e6c9bfe0ad45e20c415100505113da0f5c436cfd0a4d27579fdc` | `sha256:aa4f72e0983a9ad09b6af8c6854d3cece734836d208c989b7bf894212cb4d8b1` |

- **Security route:** no repository `SECURITY.md`; the Shopify organisation policy points to HackerOne; private reporting enabled. No advisory on GitHub or osv.dev.
- **Maintenance:** about one release a year; last push 2026-10-20; 72 open issues and 19 open pull requests.
- **Partitions (unverified):** the HTTP API listens on port 8474 and is unauthenticated unless `TOXIPROXY_AUTH_TOKEN` is set. A proxy is taken down with `{"enabled": false}`; the `timeout` toxic with `timeout: 0` drops data without closing the connection (a black hole); `reset_peer` simulates a TCP reset. Toxics apply per direction, so a two-way partition needs one per stream.
- **Client:** `toxiproxy-node-client@4.1.0` (ISC, no dependencies) exists, but the control surface is a small JSON HTTP API that Node's built-in `fetch` covers.

**Proposal:** `ghcr.io/shopify/toxiproxy:2.13.0` by its index digest, reachable only on the test network, controlled through `fetch` from item 10's harness without a client package.

## 8. Summary of proposals

| Component | Proposal | Decision |
| --- | --- | --- |
| PostgreSQL | `postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` | D1 (a); variant proposed |
| NATS server | `nats:2.15.1-alpine@sha256:7ae34c25dfd6fe2e01c6483eabef20d796690fdcac6c4d94ca780a6cf9877fde` | D2 (a); variant proposed |
| NATS client | `@nats-io/transport-node`, `@nats-io/jetstream`, `@nats-io/nats-core` at 3.4.0 | Proposed |
| SQLite | `node:sqlite` in Node 24.22.1 (SQLite 3.53.4); fallback `better-sqlite3@13.0.3` | D4 (a) with (b) |
| PostgreSQL driver | `pg@8.23.1` with `@types/pg@8.23.1` | D6 (a); driver proposed |
| Migration tool | `node-pg-migrate@9.0.0`; runner-up dbmate `v2.37.0` | D6 (a); tool proposed |
| Partition proxy | `ghcr.io/shopify/toxiproxy:2.13.0@sha256:5d3dae09bc185dcc5ff6cf43abf6062a4a720aff0c4306a471e773acdcd107aa` | D8 (a) |

## 9. Not verified and remaining work

- Nothing was started, connected to, or installed; every capability claim outside the `node:sqlite` checks waits for items 2, 5, 9, 10, 11, 12, and 14.
- The image contents, their package inventories and licenses, and vulnerability scans of the images were not assessed.
- nats.js 3.4.0 against nats-server 2.15.1 and on Node 24.22.1; the `types` field typo in two `@nats-io` packages.
- Whether `better-sqlite3` 13.0.3 builds from source without a prebuilt binary, and whether its prebuilt binaries load on Node 24.22.1.
- The nats-server v2.15.1 release notes name Go 1.27.2, while its `go.mod` names toolchain go1.26.8; not resolved.
- SQLite's private reporting channel; `security_and_analysis` repository settings (they need administrator rights).
- Independent adoption of each exact pinned version; operational, backup, restore, upgrade, and recovery evidence, which the dependency policy requires before any of these becomes `accepted`.

## Sources

Pinned to a tag, commit, or exact version unless labeled unversioned; all observed 2026-10-25.

- PostgreSQL: [18.6 release notes](https://www.postgresql.org/docs/release/18.6/); [18.6 announcement](https://www.postgresql.org/about/news/postgresql-186-1711-1615-1519-1424-and-19-beta-3-released-3365/); unversioned: [versioning policy](https://www.postgresql.org/support/versioning/), [security](https://www.postgresql.org/support/security/), [license](https://www.postgresql.org/about/licence/).
- `postgres` image: [`library/postgres`](https://github.com/docker-library/official-images/blob/1b851c635e093e70beddd58d633ddaf5e307abfc/library/postgres); [source commit](https://github.com/docker-library/postgres/commit/e00e1bd34ec5c8a8e7ad89b273b3d42efaf6d5bc); [image documentation](https://github.com/docker-library/docs/blob/945743319f7a30643060227cbbcf468b002aed23/postgres/README.md); [official images security policy](https://github.com/docker-library/official-images/blob/2933505517081d1f2d259dd532380d4a50556c5a/SECURITY.md); unversioned: Docker Hub.
- nats-server: [v2.15.1](https://github.com/nats-io/nats-server/releases/tag/v2.15.1); [v2.15.0](https://github.com/nats-io/nats-server/releases/tag/v2.15.0); [v2.14.8](https://github.com/nats-io/nats-server/releases/tag/v2.14.8); [`RELEASES.md`](https://github.com/nats-io/nats-server/blob/8a01d8020a92c1cb425adbc4d8acf30287d9d224/RELEASES.md); [`SECURITY.md`](https://github.com/nats-io/nats-server/blob/f8f6db894528640b27311353e874ac62c3a47af5/SECURITY.md); [organisation security policy](https://github.com/nats-io/nats-general/blob/bb141e0cd2bdd779d2cc2b144f4c2245fdafec40/SECURITY.md); unversioned: [advisories](https://advisories.nats.io/), [repository advisories](https://github.com/nats-io/nats-server/security/advisories), osv.dev.
- `nats` image: [`library/nats`](https://github.com/docker-library/official-images/blob/e0a2ea14d061004489511676a94f4c9ad827c568/library/nats); [source commit](https://github.com/nats-io/nats-docker/commit/57332cb1aea214fbf8aca7683ffae4c5751c0409); [image documentation](https://github.com/docker-library/docs/blob/e9a2e3e3bf63b3bfa1a36509d16e9210fe875607/nats/content.md); unversioned: Docker Hub.
- NATS client: [nats.js v3.4.0](https://github.com/nats-io/nats.js/tree/v3.4.0); [feature gates](https://github.com/nats-io/nats.js/blob/v3.4.0/core/src/semver.ts); [Node CI workflow](https://github.com/nats-io/nats.js/blob/v3.4.0/.github/workflows/transport-node-test.yml); adopters [`@graphql-hive/pubsub`](https://github.com/graphql-hive/gateway/blob/e193b78247a7c73df1cfb10045c457cd7e94c8c6/packages/pubsub/package.json) and [`@testcontainers/nats`](https://github.com/testcontainers/testcontainers-node/blob/a3465510f5cc460a0fac1e696ad83781452abdfd/packages/modules/nats/package.json); unversioned: npm.
- Node and SQLite: [`sqlite.md`](https://github.com/nodejs/node/blob/v24.22.1/doc/api/sqlite.md#L18); [`sqlite3.h`](https://github.com/nodejs/node/blob/v24.22.1/deps/sqlite/sqlite3.h#L149-L151); [Node `LICENSE`](https://github.com/nodejs/node/blob/v24.22.1/LICENSE); [Node `SECURITY.md`](https://github.com/nodejs/node/blob/v24.22.1/SECURITY.md); [v24.22.1 release](https://github.com/nodejs/node/releases/tag/v24.22.1); unversioned: [SQLite CVEs](https://www.sqlite.org/cves.html), [SQLite copyright](https://www.sqlite.org/copyright.html), [SQLite chronology](https://www.sqlite.org/chronology.html).
- `better-sqlite3`: [v13.0.3](https://github.com/WiseLibs/better-sqlite3/tree/v13.0.3); adopter [`drizzle-orm`](https://github.com/drizzle-team/drizzle-orm/blob/eab8bedbb65d5429c54e612ddbd88aa23091d398/drizzle-orm/package.json); unversioned: npm, osv.dev.
- `pg`: [pg@8.23.1](https://github.com/brianc/node-postgres/tree/pg%408.23.1/packages/pg); [GHSA-wc9v-mj63-m9g5](https://github.com/advisories/GHSA-wc9v-mj63-m9g5); adopters [`n8n`](https://github.com/n8n-io/n8n/blob/61e5b01d8d0e7f26d836f25d02bb9b145a197752/packages/cli/package.json) with its [catalog](https://github.com/n8n-io/n8n/blob/61e5b01d8d0e7f26d836f25d02bb9b145a197752/pnpm-workspace.yaml) and [`directus`](https://github.com/directus/directus/blob/f00c9e21ae78f0c23a0d183a266f02d3f9281a05/api/package.json); unversioned: npm, osv.dev.
- Migration tools: [node-pg-migrate v9.0.0](https://github.com/salsita/node-pg-migrate/tree/v9.0.0) with its [runner](https://github.com/salsita/node-pg-migrate/blob/v9.0.0/src/runner.ts) and [loading strategies](https://github.com/salsita/node-pg-migrate/blob/v9.0.0/docs/src/migration-loading-strategies.md); [dbmate v2.37.0](https://github.com/amacneil/dbmate/tree/v2.37.0); [graphile-migrate v1.4.1](https://github.com/graphile/migrate/tree/v1.4.1) and its [organisation security policy](https://github.com/graphile/.github/blob/e749c3aaf00fef377ca963b987c7d9916e34cdbc/SECURITY.md); [postgrator v8.0.0](https://github.com/rickbergfalk/postgrator/tree/v8.0.0); [postgrator-cli v10.0.0](https://github.com/MattiLehtinen/postgrator-cli/tree/v10.0.0); unversioned: npm, ghcr.io, osv.dev.
- Toxiproxy: [v2.13.0](https://github.com/Shopify/toxiproxy/tree/v2.13.0) and its [README](https://github.com/Shopify/toxiproxy/blob/v2.13.0/README.md); [Shopify security policy](https://github.com/Shopify/.github/blob/5eea7e85db75d40827cb229aa4c7bd9ac8ee05a0/SECURITY.md); unversioned: ghcr.io, osv.dev.
