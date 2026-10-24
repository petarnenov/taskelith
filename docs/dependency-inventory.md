# Dependency evidence generation

The retained [CycloneDX SBOM](dependencies/sbom.cdx.json) and [license inventory](dependencies/licenses.json) describe the current lockfile. They are development evidence and are excluded from the npm package. The [dependency register](dependencies.md) records admission decisions and security findings separately.

## Generate and check

Use Node 24.22.1 from `.nvmrc` and npm 12.2.1 from the release workflow. Both exact versions are enforced by the inventory command. A clean `npm ci --ignore-scripts` must install all locked package paths first.

```sh
npm run inventory:dependencies
npm run verify:dependencies
```

Generation writes both retained files. Review their diff with the lockfile and dependency decision register. Check mode compares without writing and fails on drift. CI runs it after tests and before installed-tarball verification. It does not block on the already recorded license coverage gaps; passing means retained evidence matches the inspected tree, not that dependencies have passed admission.

For a local shell with a different Node/npm pair, run the exact tools without changing the repository's dependency selections:

```sh
npm exec --yes --package=node@24.22.1 --package=npm@12.2.1 -- npm run inventory:dependencies
npm exec --yes --package=node@24.22.1 --package=npm@12.2.1 -- npm run verify:dependencies
```

This bootstrap command may download the specified tools from npm. It does not publish anything. Prefer the normal CI setup for routine automation.

## Coverage and provenance

The generator uses npm's built-in `sbom --sbom-format=cyclonedx --package-lock-only`. It removes only the generated timestamp and random serial number, sorts component/dependency identities and edge lists, and retains the graph and metadata. No custom SBOM or license classifier is introduced.

The license inventory records each locked installation path, package version, lockfile integrity, installed manifest hash, declared license including legacy `licenses`, and SHA-256 hashes of discovered top-level LICENSE/COPYING/NOTICE files. It also records tool versions and hashes of the package manifest, lockfile, Node pin, and generator sources. Paths are relative to the repository. Missing installations, mismatched installed versions, and linked package directories fail generation rather than silently reducing coverage.

Current evidence: 487 installation paths, 143 bundled entries, 478 license/notice files, 459 deduplicated SBOM components, and 14 reviewed coverage gaps. A second run and a clean install under exact tool versions reproduced the retained evidence on macOS. Native Linux CI execution is not claimed.

## License coverage review

Fourteen paths have declarations but no top-level license text in the installed directory. Their published npm tarballs were listed and contain no such file either. Each path is reviewed in [license-reviews.json](dependencies/license-reviews.json), keyed by path, version, and installed manifest hash. Both generation and check mode fail when a gap has no matching review or a review no longer matches a gap, so a changed manifest requires a renewed review.

| Status | Packages (paths) | Located evidence |
| --- | --- | --- |
| `text-located` | `@pnpm/config.env-replace@1.1.0`, `@pnpm/network.ca-file@1.0.2`, bundled `@sigstore/verify@3.1.1`, `isarray@1.0.0`, `java-properties@1.0.2`, `type-fest@2.19.0` (6) | Full text in the installed README (isarray), upstream source at the registry gitHead (sigstore, type-fest), or an upstream license file that predates the release when no gitHead exists (pnpm, java-properties). |
| `notice-only` | `array-ify@1.0.0`, `spdx-exceptions@2.5.0` (top-level and bundled), `spdx-license-ids@3.0.24` and bundled `3.0.23` (5) | README copyright or license statements; bundled copies rely on the upstream README at the registry gitHead. |
| `declaration-only` | bundled `@npmcli/agent@4.0.2`, `nerf-dart@1.0.0`, `proxy-agent-negotiate@1.1.0` (3) | Manifest declaration only; upstream source at the published version has no license text. The nerf-dart README says its code was taken from npm/npm; the license of that origin was not assessed. |

All fourteen are development or release tooling and are not redistributed in the Taskelith npm package. The review records located evidence; it is not legal interpretation and does not admit the packages. On 2026-10-24 the owner accepted `notice-only` and `declaration-only` evidence as sufficient for development and release tooling ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)); this does not extend to shipped runtime dependencies. Global Node/npm binary notices, CI action sources, native third-party tools, nested vendored code, and model artifacts are outside this npm installation inventory.

## Security remediation assessment

The exact npm 12.2.1 audit still reports the two previously recorded vulnerable packages inside the release plugin's bundled npm 11.21.1. In a disposable manifest/lockfile copy, `npm audit fix --package-lock-only --ignore-scripts --json` exited 1, left the lockfile unchanged, and retained one moderate and one high finding. This is an observed failed remediation attempt, not a general assertion that fixes can never work.

No live dependency or vendor file was changed. The pinned plugin was the latest observed in the register; a supported fixed upstream bundle has not been established. Track and test an upstream repair through a separate change. Production-only audit remains distinct from developer/release-tool exposure. No security exception beyond the owner's recorded time-bounded exception is inferred, and full dependency admission remains open; for development and release tools it is deferred to G8 ([ADR 0007](decisions/0007-g0-closure.md)).

Upstream status on 2026-10-24: `@semantic-release/npm@13.2.0` is the `latest` tag and depends on `npm@^11.6.2`, which resolves to npm 11.21.1, the newest 11.x release (published 2026-10-15). Its published tarball bundles `ip-address@10.7.2` and `undici@6.29.0`. Fixed `ip-address@10.7.4` (published 2026-10-11) and `undici@6.29.1` (published 2026-10-15) exist, but no npm release bundles them yet. The only plugin line moving to npm 12 is the prerelease `14.0.0-beta.2` (published 2026-10-23, `npm@^12.2.1`). The npm 12.2.1 tarball, which is also the CI global npm pin, bundles the same two vulnerable versions. Upgrading the plugin therefore would not remediate the findings, and the CI global npm binary carries the same exposure outside the lockfile audit. Bundled npm dependencies cannot be replaced through lockfile overrides without patching the vendor bundle, which this policy forbids. Remediation waits on an npm release that bundles the fixed versions. On 2026-10-24 the owner accepted the interim exposure as a time-bounded exception that ends when such a release is available ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)).
