# Automatic releases

Taskelith uses semantic-release and GitHub Actions. The repository checks are defined once, as `make verify` in the root `Makefile`; the same target is the local gate and the GitHub `verify` job. Each push to `main` runs `make verify` and then the release job; qualifying Conventional Commits produce an npm version, a Git tag, GitHub release notes, and npm provenance.

## Branch flow

1. Development happens on feature branches, which are merged into `dev`, the default branch, through pull requests. Pushes and pull requests targeting `dev` run no workflow.
2. Before every push, `make verify` must pass locally. Run `make hooks` once per clone; the `pre-push` hook then runs `make verify` and blocks the push on failure. The target first checks that Node matches `.nvmrc` and npm matches the CI pin.
3. A promotion pull request from `dev` into `main` runs `make verify` in GitHub.
4. Merging the promotion into `main` runs `make verify` again and releases qualifying changes.

| Commit | Version change |
| --- | --- |
| `fix: correct CLI output` | Patch |
| `feat: add project creation` | Minor |
| `feat!: replace CLI invocation` or a `BREAKING CHANGE:` footer | Major |
| `docs:`, `test:`, `chore:` without breaking changes | No release |

The largest increment since the last release wins. These rules also apply before 1.0; a breaking change advances the major version. One promotion may bundle several changes; their commits are analyzed together, and the largest increment among them wins. Promotions use a merge commit or a rebase, never a squash, so that semantic-release sees each Conventional Commit and its breaking-change footer.

## Version source of truth

Published Git tags and npm versions are authoritative. semantic-release changes package.json in the release workspace and published package, without committing a generated version bump back to main. The version in a source checkout is therefore a development placeholder; the installed CLI reports the published package's actual version. The existing 0.1.0 release is anchored by tag v0.1.0.

## Authentication

The npm trusted publisher must authorize GitHub user `petarnenov`, repository `taskelith`, workflow filename `release.yml`, with direct `npm publish` allowed. No GitHub environment is configured. The workflow uses GitHub-hosted runners and `id-token: write`; there is no NPM_TOKEN or NODE_AUTH_TOKEN secret. Account MFA remains enabled.

One-time owner setup with npm 12.2.1 and Node 24.22.1:

```bash
npm trust github taskelith --repository petarnenov/taskelith --file release.yml --allow-publish --yes
```

npm may require interactive MFA for this administrative action. Future authorized workflow releases use OIDC and do not prompt for MFA. Manual laptop publishing still follows npm's interactive authentication policy.

## Verification and recovery

The workflow installs locked dependencies without lifecycle scripts and runs `make verify`: tests, the dependency inventory check, strict OpenSpec validation, and the packed file allowlist and installed CLI checks. Publishing runs only after verification succeeds. Workflow runs are serialized and are not cancelled mid-publication.

Use the workflow's manual dispatch on main to retry. Before retrying after a partial publication failure, inspect npm versions, Git tags, and GitHub releases. Never move a published version tag or attempt to reuse an npm version. If npm publication succeeded but release notes failed, complete the missing GitHub release for the existing tag. If only a tag exists, investigate the failed publication before taking further action. Disable the workflow to suspend automatic publishing.

The owner requested this automatic publication policy. Changes merged or pushed to main with release-producing commits authorize publication under this policy.

## Sources

- [npm security and 2FA-bypass token deprecation](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm trust CLI](https://docs.npmjs.com/cli/v12/commands/npm-trust/)
- [semantic-release GitHub Actions](https://semantic-release.org/recipes/ci-configurations/github-actions/)
