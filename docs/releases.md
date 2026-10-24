# Automatic releases

Taskelith uses semantic-release and GitHub Actions. The repository checks are defined once, as `make verify` in the root `Makefile`; the same target is the local gate and the GitHub `verify` job. Each push to `main` runs `make verify` and then the release job; qualifying Conventional Commits produce an npm version, a Git tag, GitHub release notes, and npm provenance.

## Branch flow

1. Each change is developed on its own feature branch in its own git worktree, so several changes can proceed in parallel, and is merged into `dev`, the default branch, through a pull request. Pushes and pull requests targeting `dev` run no workflow.
2. Before every push, `make verify` must pass locally. Run `make hooks` once per clone; the `pre-push` hook then runs `make verify` and blocks the push on failure. The target first checks that Node matches `.nvmrc` and npm matches the CI pin.
3. A promotion pull request from `dev` into `main` runs `make verify` in GitHub.
4. Merging the promotion into `main` runs `make verify` again and releases qualifying changes.

## Parallel work with worktrees

Keep the main clone on `dev` and give each change a worktree outside it. From the main clone:

```sh
git fetch origin
git worktree add --no-track ../taskelith-worktrees/<change> -b <change> origin/dev
cd ../taskelith-worktrees/<change>
make setup   # node_modules is per worktree
# work, commit, then push; the pre-push hook runs make verify
git push -u origin <change>
```

Push each branch from its own worktree: the `pre-push` hook refuses a push of any commit other than the checked-out one, because `make verify` checks only that. `--no-track` keeps `origin/dev` from becoming the branch's upstream, so `git push -u` sets the branch's own upstream. `node_modules` is per worktree, so each one needs `make setup`, which runs `npm ci` when the dependencies are missing. The `core.hooksPath` and dependency inventory merge driver settings from `make hooks` are shared repository configuration, so the `pre-push` gate, the `post-merge` inventory check, and the [inventory merge driver](dependency-inventory.md#merging-parallel-branches) apply in every worktree. After the pull request is merged, from the main clone: `git switch dev && git pull --ff-only` to confirm the merge landed, then `git worktree remove ../taskelith-worktrees/<change>` and `git branch -D <change>`. `-D` is needed because a rebase merge rewrites the branch's commits, so git does not see the local branch as merged.

Two pitfalls, both observed on 2026-10-24:

- `gh pr merge --delete-branch` run from a worktree merges the pull request but leaves the remote branch in place: before deleting the local branch, `gh` switches the worktree to `dev`, which fails because the main clone has `dev` checked out, and `gh` stops before it deletes the remote branch. After confirming that the pull request is merged, delete the remote branch from the main clone with `git push origin --delete <change>`.
- The `pre-push` hook runs `make verify` for every push, including a branch deletion such as `git push origin --delete <change>`. `make verify` switches to the `.nvmrc` Node.js through nvm when nvm has it; without it, the toolchain check fails and the deletion is refused.

## Branch protection

Applied by the owner's authorization on 2026-10-24:

- `main` accepts changes only through a pull request whose `verify` check passed on a branch that is up to date with `main`. Administrators are included. Force pushes and deletion are blocked. Tags created by the release job are not affected.
- `dev` blocks force pushes and deletion.
- Squash merging is disabled for the repository; merge commits and rebase merges stay available.

GitHub cannot require that a pull request into `main` comes from `dev`; that rule is kept by convention.

Because the `verify` check must run on a branch that is up to date with `main`, synchronize `dev` after every promotion:

- After a merge-commit promotion, `dev` is only behind: fast-forward it with `git fetch origin && git switch dev && git merge --ff-only origin/main && git push`.
- After a rebase promotion, `main` holds rewritten copies of the promoted commits, so the histories diverge: merge `main` into `dev` with `git fetch origin && git switch dev && git merge origin/main && git push`. Merge-commit promotions avoid this step's extra merge commit.

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

The workflow installs locked dependencies without lifecycle scripts and runs `make verify`: tests with coverage thresholds of 75% for lines, branches, and functions and a check that every product module is covered, the contract compatibility check, the dependency inventory check, strict OpenSpec validation, and the packed file allowlist and installed CLI checks. Publishing runs only after verification succeeds. Workflow runs are serialized and are not cancelled mid-publication.

Use the workflow's manual dispatch on main to retry. Before retrying after a partial publication failure, inspect npm versions, Git tags, and GitHub releases. Never move a published version tag or attempt to reuse an npm version. If npm publication succeeded but release notes failed, complete the missing GitHub release for the existing tag. If only a tag exists, investigate the failed publication before taking further action. Disable the workflow to suspend automatic publishing.

The owner requested this automatic publication policy. Changes merged or pushed to main with release-producing commits authorize publication under this policy.

## Sources

A link labeled "docs" is an unversioned page, last retrieved on 2026-10-24; the others are pinned to a commit or tag.

- npm security and 2FA-bypass token deprecation ([docs](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/))
- [npm trusted publishing](https://github.com/npm/documentation/blob/6af52f08a7345a8a96fc095c1e3c6117bbbac72c/content/packages-and-modules/securing-your-code/trusted-publishers.mdx)
- [npm trust CLI](https://github.com/npm/cli/blob/v12.2.1/docs/lib/content/commands/npm-trust.md)
- semantic-release GitHub Actions recipe ([docs](https://semantic-release.org/recipes/ci-configurations/github-actions/))
