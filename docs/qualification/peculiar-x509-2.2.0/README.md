# `@peculiar/x509` 2.2.0 qualification

G3 sub-change 26a (`issue-installation-certificates`) installs `@peculiar/x509@2.2.0` as an exact-pinned runtime dependency of the private `@taskelith/certificates` adapter package, behind the `CertificateIssuer` port of `@taskelith/fleet`. It creates the installation CA and issues the API and NATS server certificates ([installation contract](../../contracts/installation-and-enrollment.md) section 7). The published `taskelith` package does not include it. Facts were observed on 2026-10-28 under Node 24.22.1 on macOS 26.6.2 arm64 (Apple M3).

## Package

- Version 2.2.0, published 2026-10-15. Repository [PeculiarVentures/x509](https://github.com/PeculiarVentures/x509), seven npm maintainers under the Peculiar Ventures organization; the npm registry lists a provenance attestation for 2.2.0.
- License MIT, with a `LICENSE` file in the package.
- No `preinstall`, `install`, or `postinstall` script in it or in any package it pulls in; the lockfile marks none of them `hasInstallScript`.
- Lockfile integrity `sha512-adpW58ySPQMOUPv8pTKT3RIyCFqfUFt8X05ukPdtkQToXDVr8dMtxuenik1yx8tNFTbpApWsM/Hi5SzlIx48+Q==`.
- `npm audit --omit=dev` reports 0 vulnerabilities.

## Why 2.2.0 and not 3.x

3.0.0 and 3.1.0 were both published on 2026-10-27, one day before this change, and 3.0.0 is a new major version. A release that young has no adoption or advisory history yet, so 2.2.0, the latest 2.x release, is pinned. An upgrade to 3.x is a separate change with its own review of the release notes.

## The `Reflect` metadata polyfill

The library resolves its parsers through `tsyringe`, which needs a `Reflect` metadata polyfill that neither package declares; without it the import fails with `tsyringe requires a reflect polyfill`. The adapter therefore depends on `reflect-metadata@0.2.2` (Apache-2.0, [rbuckton/reflect-metadata](https://github.com/rbuckton/reflect-metadata), no install script, integrity `sha512-urBwgfrvVP/eAyXx4hluJivBKzuEbSQs9rKWCrCkbSxNv8mxPcUZKeuoF3Uy4mJl3Lwprp6yy5/39VWigZ4K6Q==`) and imports it before the library.

## Transitive runtime packages

| Package | Version | License |
| --- | --- | --- |
| `@peculiar/asn1-asym-key`, `-cms`, `-csr`, `-ecc`, `-pfx`, `-pkcs8`, `-pkcs9`, `-rsa`, `-schema`, `-x509`, `-x509-attr`, `-x509-post-quantum` | 2.11.1 | MIT |
| `@peculiar/utils` | 2.0.3 | MIT |
| `asn1js` | 3.1.0 | BSD-3-Clause |
| `pvtsutils` | 1.3.6 | MIT |
| `pvutils` | 1.2.0 | MIT |
| `tsyringe` | 4.10.0 | MIT |
| `tslib` | 2.8.1 and 1.14.1 | 0BSD |

The [dependency inventory](../../dependency-inventory.md) records every path from the lockfile.

## Use and checks

Keys come from Node's WebCrypto (ECDSA P-256 with SHA-256, exported as PKCS#8 PEM); the library only builds and signs the certificates. The adapter's tests, which generate every key and certificate at run time, check with Node's own `X509Certificate` that the CA is a self-signed CA, and that a server certificate is no CA, is signed by it, carries the requested DNS and IP names, no other, and only the server-authentication usage, has a serial other than the CA's, and matches its key. A refusal names no input or key. The adapter draws each serial from 128 random bits.

## Fallback and upgrade check

If the library must go, the `openssl` binary behind the same port replaces it; `node-forge` is not a fallback. Before an upgrade, check the release notes and advisories, that no package gains an install script, the licenses, and that the tests of `@taskelith/certificates` and the installation TLS tests still pass.
