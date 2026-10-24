# Dependency inventory verification

Date: 2026-10-24. Author implementation/verification and independent review recorded separately below.

## Scope and source

Owner request: continue autonomously until an owner decision is required. Base source revision: `77b1450d49669da58cac9a486469428031a3acc2`. Reviewed working-tree scope: inventory library/command and tests; package scripts; `scripts/verify-package.ts`; verify job's inventory step; README and dependency/foundation documentation; retained `licenses.json` and `sbom.cdx.json`; this change's artifacts.

No product runtime behavior, dependency version, lockfile, release authentication, publication, or deployment changed. Repository scripts use TypeScript. The installed-tarball allowlist excludes the new scripts and inventory artifacts.

## Exact toolchain and reproduction

Used Node 24.22.1 and npm 12.2.1 via isolated npm exec packages, matching `.nvmrc` and both workflow pins. Initial local shell remains Node 24.21.0/npm 11.19.0. No global installation was replaced.

- `npm run inventory:dependencies` under the exact pair generated retained evidence: 487 installation paths, 143 bundled packages, 478 license/notice-file hashes, 459 CycloneDX 1.5 components, and 14 installation paths with no detected top-level license text.
- `npm run verify:dependencies` under the exact pair passed without rewriting the artifacts.
- Copied explicit repository sources/manifests into a fresh temporary directory, excluding local state and node_modules. `npm ci --ignore-scripts --no-fund --no-audit` installed the locked tree. `npm test`, `npm run verify:dependencies`, and `npm run verify:package` all passed there under the exact pair. The temporary checkout was removed afterward.
- This proves local macOS reproducibility; the updated GitHub-hosted Linux workflow has not run.
- Invoking the inventory check under the original Node 24.21.0 failed on the exact Node constraint and left both retained files unchanged.

## Tests and checks

- `npm test`: all 15 tests passed both in the working tree and clean temporary install under the exact pair. New tests exercise legacy bundled declarations, missing declarations/text, missing or mismatched installs, traversal rejection, SBOM graph/metadata preservation, volatile-field normalization, path independence, and non-mutating drift detection.
- Standalone strict TypeScript check passed using `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --allowImportingTsExtensions --types node` for the new scripts and their test.
- `OPENSPEC_TELEMETRY=0 npm run openspec -- validate --all --strict --no-interactive`: all six changes passed.
- `npm run verify:package`: passed, including verification that packaged markdown files (`README.md`, `docs/architecture.md`) contain no broken relative links to excluded files.
- `git diff --check`: passed. New documentation links/whitespace were checked; retained JSON parses and contains neither the checkout path nor `/Users/` or `file://` workstation references.
- The inventory records hashes and declarations, not legal approval or a full nested-vendor/native binary audit. The 14 coverage gaps are listed in the inventory guide and retained data.

## Security remediation experiment

Exact npm 12.2.1 `npm audit --json` returned exit 1 and the existing moderate ip-address/high undici findings under the release plugin's bundled npm. In a disposable copy of the manifest and lockfile, `npm audit fix --package-lock-only --ignore-scripts --json` also exited 1, left the lockfile byte-identical, and retained both findings on a subsequent audit. The temporary copy was removed. No live dependency or vendor patch was attempted, and no audit exception is inferred. Prior production-only audit results are recorded separately in the register.

## Independent review

- **Reviewer identity:** Separate OpenAI Codex CLI agent (`codex-cli 0.164.0`), explicitly authorized by the owner on 2026-10-24.
- **Model ID and effort:** `gpt-6.1-sol`, `model_reasoning_effort = "medium"` (configured in `~/.codex/config.toml` and CLI execution, read-only sandbox).
- **Pass 1 (session `01a16d74-cd29-7642-b4e0-28a59e62c662`):** Reviewed working-tree snapshot over base `77b1450d49669da58cac9a486469428031a3acc2`. Verified provenance hashes, all 487 installed package records against `docs/dependencies/licenses.json`, CycloneDX graph integrity in `docs/dependencies/sbom.cdx.json`, strict TypeScript compilation, and unit tests. Reported 1 Low finding (`README.md:53` relative link to `docs/dependency-inventory.md`, which is excluded from the npm tarball).
- **Resolution & Pass 2 (session `01a16d80-a7e5-7981-86e0-1768a2e1cdd6`):** Converted `README.md` links to excluded repository docs to canonical GitHub URLs, added relative-link validation to `scripts/verify-package.ts`, and re-verified with the independent Codex reviewer (`gpt-6.1-sol`, `effort: medium`), which confirmed 0 findings remain (0 Critical, 0 High, 0 Medium, 0 Low).

## Remaining gates

Independent review of this change is complete. Integration (commit, push, merge), archival, and native Linux CI evidence remain pending. No review exception, push, release, or deployment is claimed. G0 qualification remains incomplete because of recorded maintenance/adoption gaps, 14 missing license-text coverage paths, global/native inventory, and 2 development audit findings.
