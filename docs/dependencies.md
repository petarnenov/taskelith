# Dependency decision register

Assessment date: 2026-10-24. Scope: installed bootstrap tools, not runtime infrastructure admission.

## Status and evidence rules

`candidate` means evidence or acceptance remains incomplete; `accepted` requires the architecture's version-specific license, maintenance, security, independent adoption, and relevant operational evidence; `rejected` excludes a component; `replacement-required` identifies a selected version that needs remediation or replacement. Existing installation is not equivalent to acceptance. The assessment makes no new admission decisions on behalf of an independent reviewer.

The [metadata snapshot](dependencies/toolchain-metadata.json) records registry publication dates, observed latest versions, engines, repository, license declaration, and tarball integrity. Exact installed versions are in `package-lock.json`; license declarations were cross-checked against installed direct manifests. These declarations are not a transitive license-text audit. Latest tags and unpinned upstream policy pages are observations as of the assessment date, not immutable evidence.

## Direct development tools

All nine packages below are development-only. Every row remains `candidate` for full architectural admission; the final column states why. No dependencies or versions were changed by this assessment.

| Package and exact version | Role | License; Node requirement | Upstream | Assessment and remaining admission evidence |
| --- | --- | --- | --- | --- |
| `@fission-ai/openspec@1.14.3` | Selected repository SDLC CLI | MIT; `>=20.19.0` | [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Released 2026-10-17; latest observed 1.15.0. Local strict validation works. Current security policy patches only the latest release: assess 1.15.0 compatibility before upgrading. Independent adoption evidence and both-framework mapping/conformance remain missing. |
| `typescript@5.9.3` | Compile product TypeScript | Apache-2.0; `>=14.17` | [TypeScript](https://github.com/microsoft/TypeScript) | Released 2025-09-30; latest observed 7.0.2. Build works, but current support/security maintenance for the pinned 5.9 branch is not established. Upgrade compatibility assessment and version-relevant adoption evidence remain open. |
| `@types/node@24.19.2` | Node API declarations | MIT; no Node engine declared | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) | Released 2026-10-09; matches the development Node major. Build works. Version 24 declarations do not prove published Node 22 runtime compatibility; type/runtime alignment and version-specific adoption remain open. |
| `semantic-release@25.0.9` | Release orchestration | MIT; `^22.14.0 \|\| >=24.10.0` | [semantic-release](https://github.com/semantic-release/semantic-release) | Released 2026-08-05; still latest in snapshot. Existing OIDC release is recorded separately. A private reporting route, independent version-relevant usage, and failure-recovery drill remain unverified. |
| `@semantic-release/commit-analyzer@13.0.1` | Conventional Commit classification | MIT; `>=20.8.1` | [commit-analyzer](https://github.com/semantic-release/commit-analyzer) | Released 2025-01-03; still latest. Classification fixtures pass. Long release interval alone proves neither abandonment nor support. Maintainer support, security route, and independent adoption remain open. |
| `@semantic-release/github@12.0.10` | GitHub release notes publication | MIT; `^22.14.0 \|\| >=24.10.0` | [github plugin](https://github.com/semantic-release/github) | Released 2026-09-21; still latest. Historical release evidence exists. Private security reporting, independent adoption, and recovery from partial publication remain unverified. |
| `@semantic-release/npm@13.2.0` | npm package publication | MIT; `^22.14.0 \|\| >=24.10.0` | [npm plugin](https://github.com/semantic-release/npm) | Released 2026-09-21; still latest. Bundles npm 11.21.1 with two audited vulnerable packages, covered by the time-bounded owner exception in [ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md) after the [remediation assessment](dependency-inventory.md#security-remediation-assessment). Private reporting route, independent usage, and recovery evidence block acceptance. |
| `@semantic-release/release-notes-generator@14.1.1` | Render release notes | MIT; `>=20.8.1` | [release-notes-generator](https://github.com/semantic-release/release-notes-generator) | Released 2026-05-08; still latest. Rendering regression test passes. Support, private security reporting, and independent adoption remain unverified. |
| `conventional-changelog-conventionalcommits@9.3.1` | Commit parsing and notes preset | ISC; `>=18` | [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-conventionalcommits) | Released 2026-03-29; latest observed 10.4.1. Existing 9.x pin fixes a documented preset compatibility failure; do not upgrade by latest tag alone. Security route, independent usage, and maintained 9.x support remain unverified. |

The semantic-release upstream [manifest](https://github.com/semantic-release/semantic-release/blob/master/package.json) shows use of its four plugins and Node declarations. This is ecosystem integration evidence, not independent adoption of every Taskelith-pinned version. The VS Code [manifest](https://github.com/microsoft/vscode/blob/main/package.json) demonstrates real TypeScript-based build usage, but does not establish continued support for TypeScript 5.9.3. No stars, download counts, or unsupported claims close these gaps.

## Runtime and package-manager tools

| Component | Exact selection and license | Status and qualification limits |
| --- | --- | --- |
| Node.js | CI/development pin 24.22.1 in `.nvmrc`; MIT plus bundled third-party notices in the [version-specific LICENSE](https://github.com/nodejs/node/blob/v24.22.1/LICENSE) | `candidate`. Node 24 is listed as LTS in the official [release schedule](https://nodejs.org/en/about/previous-releases). Initial checks used 24.21.0; follow-up inventory work reproduced clean-install tests under 24.22.1 on macOS. Distributed binary/notices, native Linux evidence, version-relevant adoption, and upgrade tests remain open. The published CLI declares `>=22`; that is separate from the development toolchain. |
| npm CLI in CI | 12.2.1, Artistic-2.0; Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`; [npm/cli](https://github.com/npm/cli) | `candidate`. Released 2026-10-15 and latest at assessment. The CI Node pin satisfies this engine constraint. Follow-up inventory work verified exact-version dependency SBOM/audit and clean install; global npm binary inventory and full qualification remain open. Its published tarball bundles the same vulnerable `ip-address@10.7.2` and `undici@6.29.0` as the release plugin's npm; this global-binary exposure is outside the lockfile audit and is covered by the same time-bounded owner exception ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)). Historical OIDC activation is not a new run. |
| npm CLI inside the release plugin | 11.21.1, Artistic-2.0; [npm/cli](https://github.com/npm/cli) | `replacement-required` for full admission: bundled `ip-address` and `undici` advisories remain under a time-bounded owner exception ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)) that ends when an npm release bundles the fixed versions. As of 2026-10-24 no npm 11.x or 12.x release bundles the fixed versions, so no plugin upgrade remediates them; see the [inventory remediation assessment](dependency-inventory.md#security-remediation-assessment). Do not edit bundled modules or add publish tokens. |
| Local inspection tools | Node 24.21.0; npm 11.19.0 | Observed environment, not a change to CI pins. Audit and SBOM results below were produced with this npm version. |

The workflow's checkout and setup-node actions remain pinned by commit SHA. GitHub-hosted CI/npm publication are the existing owner-authorized bootstrap delivery services; they are not an approved mandatory dependency of the self-hosted Taskelith runtime. Native Git, action implementation/license qualification, and hosted-service reproducibility remain outside this toolchain assessment.

## Security reporting and operations

- OpenSpec: [security policy](https://github.com/Fission-AI/OpenSpec/blob/main/SECURITY.md) documents private advisories and latest-only fixes. Its current policy describes telemetry opt-out with `OPENSPEC_TELEMETRY=0`; run repository validation with that variable when disabling developer-tool telemetry. This is separate from the shipped CLI's network behavior.
- TypeScript: [security policy](https://github.com/microsoft/TypeScript/blob/main/SECURITY.md) directs eligible reports to MSRC and distinguishes compiler robustness issues from security vulnerabilities.
- Node.js: [security policy](https://github.com/nodejs/node/security/policy) provides its reporting process. Version-specific binary inventory and security assessment remain separate checks.
- npm: [security policy](https://github.com/npm/cli/security/policy) provides GitHub's private reporting routes. Registry audits are time-dependent vulnerability reports, not security certification.
- DefinitelyTyped: [security policy](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/SECURITY.md) describes private advisory reporting and best-effort/latest-release handling.
- semantic-release and conventional-changelog: attempted root `SECURITY.md` lookups did not establish a reporting policy. Do not infer absence of a process from a failed lookup; confirm a maintained private channel for the selected components before acceptance.

Compiler/types upgrades must preserve build and CLI behavior; OpenSpec upgrades must preserve native artifacts and strict validation. Release-tool changes must pass classification and rendering fixtures, installed-tarball verification, and an authorized CI release before claiming publication compatibility. Follow [release recovery](releases.md#verification-and-recovery): published versions/tags cannot be reused or moved. Existing activation evidence is in `openspec/changes/archive/2026-10-24-automated-releases/verification.md`; no partial-publication recovery drill was performed here.

## Audit and inventory observations

`npm audit --json` reports two vulnerable development packages: moderate `ip-address` and high `undici`, both beneath `node_modules/@semantic-release/npm/node_modules/npm/node_modules/`. Relevant advisories are [ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5), [undici EventSource](https://github.com/advisories/GHSA-4qv8-2p9j-2685), and [undici content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c). The audit reports fixes available, but the [remediation assessment](dependency-inventory.md#security-remediation-assessment) found no npm release that bundles them as of 2026-10-24; the owner accepted a time-bounded exception ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)). No fix was attempted. `npm audit --omit=dev --json` reports zero findings. There are no published runtime npm dependencies.

The lockfile contains 487 dependency installation paths. Declared license counts: MIT 335, ISC 99, Apache-2.0 15, BlueOak-1.0.0 12, BSD-2-Clause 8, BSD-3-Clause 5, `(MIT OR CC0-1.0)` 5, CC-BY-3.0 2, CC0-1.0 2, and one each of Artistic-2.0, Python-2.0, and `(BSD-2-Clause OR MIT OR Apache-2.0)`. One path has no modern `license` field: npm's bundled `qrcode-terminal@0.12.0`; its installed manifest uses legacy `licenses` declaring Apache 2.0 and includes a LICENSE file. Full bundled-code/license-text review remains open.

The npm SBOM generator produced CycloneDX 1.5 with 459 components. Component identity deduplication differs from installation-path counts. The follow-up [inventory work](dependency-inventory.md) retains normalized evidence under the exact CI tool versions, including bundled manifests and license-file hashes. Fourteen installation paths lack detected top-level license text; each has a manifest-bound [review](dependencies/license-reviews.json), and the owner accepted that evidence for development and release tooling ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)). Nested vendored code and global binary inventory remain open. This is not a legal or security certification.

## Reproduce and refresh

Use a clean checkout with `.nvmrc` and the workflow's npm pin to reproduce the intended toolchain; record actual versions with every run. `npm ci --ignore-scripts` installs the lockfile. Then:

```sh
npm ls --depth=0
node --experimental-strip-types scripts/collect-toolchain-metadata.ts > /tmp/taskelith-toolchain-metadata.json
npm audit --json > /tmp/taskelith-toolchain-audit.json
npm audit --omit=dev --json > /tmp/taskelith-runtime-audit.json
npm sbom --sbom-format=cyclonedx --package-lock-only > /tmp/taskelith-toolchain-sbom.json
```

An audit exits nonzero when findings exist; retain and inspect its JSON rather than interpreting that as a collection failure. The metadata collector only queries public npm metadata; it does not update versions or credentials. Review a refreshed snapshot before replacing the checked-in evidence. Use `npm run inventory:dependencies` and `npm run verify:dependencies` for the normalized retained evidence described in the [inventory guide](dependency-inventory.md). npm's SBOM omits the globally installed Node/npm binary inventory. A new dependency revision requires refreshed qualification and checks, not automatic promotion to `accepted`.

## Agent harnesses

| Component | Exact selection and terms | Status and qualification limits |
| --- | --- | --- |
| Claude Code (G3) | `@anthropic-ai/claude-agent-sdk@0.3.308` with bundled CLI 2.1.308; proprietary, under Anthropic's legal agreements | `candidate`. macOS x86_64 egress and native-capability evidence is recorded in the [qualification record](qualification/claude-code.md). Open before admission: Linux, macOS arm64, the subscription account mechanism and credential-exposure tests required by [ADR 0005](decisions/0005-harness-subscription-account-pools.md), running with `DISABLE_AUTOUPDATER=1`, any alternative subscription-authenticated provider path, and independent adoption evidence. |

## Planned components

PostgreSQL, NATS/JetStream, Neo4j Community, React, SpecKit, embedding runtime, and model artifacts remain `candidate`, with exact deployment versions/digests unselected. The owner selected the agent harnesses Claude Code, Codex CLI, Antigravity CLI, and OpenCode, and the Forgejo SCM ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)); each remains `candidate` until version-specific qualification. Selection is not admission. Architecture license baselines do not admit an edition or provider. Qualification must include maintenance and independent adoption relevant to the selected version, security reporting, real recovery/upgrade tests, and separate model rights/transparency evidence where applicable. No runtime service was installed or contacted by this task.
