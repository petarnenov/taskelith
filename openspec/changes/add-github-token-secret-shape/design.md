## Context

The [source control contract](/docs/contracts/source-control.md) section 3 obliges item 20 to add the per-run SCM credential's secret shape to `SECRET_SHAPE_RULES` of `@taskelith/observability`. The rules are `TextRule` values built with `textRule(regex, REDACTED)` in `packages/modules/observability/src/domain/redaction-rules.ts`. `TOKEN_SHAPE_RULES` is used by log redaction (`LOG_TEXT_RULES` in `packages/modules/observability/src/domain/redaction.ts`) and, through `SECRET_SHAPE_RULES`, by the scrub of `@taskelith/secrets` (`SECRET_TEXT_RULES` in `packages/adapters/secrets/src/scrub.ts`), which serves `redactSecrets`, `redactFailure`, and `scrubEnvironment`. The GitHub plugin's per-run secret is a GitHub App installation token ([G3 plan](/docs/g3-plan.md) row 20).

## Decisions

### 1. The shape: GitHub's own pattern for both installation token formats

`redactGithubInstallationTokens` matches `/\bghs_[A-Za-z0-9._-]{36,}/g`: after a word boundary, the regex that GitHub recommends for "both new and current format tokens" (evidence E3 below). Since 2026-04-27 GitHub rolls out a stateless format, `ghs_APPID_JWT`, of about 520 characters whose length varies, next to the stateful 40-character format (E2, E4). The classic pattern `ghs_[A-Za-z0-9]{36}` matches no stateless token whose application ID has fewer than 36 digits, because the `_` after the ID ends the run, and GitHub names exactly that regex as one that "may not match the new tokens" (E2).

- **Length.** At least 36 characters after `ghs_`, without an upper bound. The stateful format is exactly 40 characters in all, `ghs_` and 36 (E2: "exactly 40 characters long"; the regex `ghs_[A-Za-z0-9]{36}`), and GitHub's recommended lower bound is the same 36 (E3). The stateless format has no documented maximum (E2: "will vary"; E3: "No hardcoded token length assumptions"), so no upper bound is justified; the greedy tail takes the whole token.
- **Character set.** `A-Za-z0-9` for the stateful body, and `.`, `-`, and `_` for the stateless one, whose application ID is separated by `_` and whose JWT has two dots and base64url parts (E2, E3). This is exactly E3's class `[A-Za-z0-9\.\-_]`.
- **Exact prefix.** Lower-case `ghs_` only (E1, E2: the prefix "is not changing"). `GHS_`, `ghx_`, and `ghs-` stay.
- **Boundaries.** A word boundary before `ghs_`, because the brief requires a token shape embedded in a longer word to stay: `ghs_` after a letter, digit, or `_`, such as `prefixghs_...suffix` or `my_ghs_...`, is no match and stays whole, while `ghs_` after a space or punctuation such as `-`, `:`, `(`, or a quote is. This departs from `redactIssuedSecrets` and `redactNkeySeeds`, whose shapes have no boundary. No end boundary is possible, because the token's own class holds `_`, `.`, and `-` and the stateless length varies: a tail of token characters glued after it is redacted with it, including a sentence's final `.`; that over-redaction is accepted, because cutting the tail could leave part of a stateless JWT.
- **Order.** The rule comes in `TOKEN_SHAPE_RULES` before `redactJwts`. Otherwise the JWT rule would replace the stateless token's JWT first and leave `ghs_APPID_` in the text, which is not secret but makes the redaction uneven; the tests expect the whole token replaced.
- **Linear time.** The boundary is a zero-width check, and after the literal `ghs_` the pattern is one greedy character class, which fails only on a run of fewer than 36 class characters, so every attempt does bounded work or consumes what it scanned. The linear-time tests of both users add `ghs_` runs.

### 2. Other GitHub token types are not added

GitHub documents the prefixes `ghp_`, `github_pat_`, `gho_`, `ghu_`, and `ghr_` (E1, E5), but neither the fetched documentation nor the blog states their length or character set: the blog says only that the change came "without changing the token length" and that the checksum is Base62 (E5). The brief allows those shapes only against a documented length and character set, and none of them is the per-run SCM credential, so this change adds none.

### 3. Observed tokens

[GitHub qualification](/docs/qualification/github.md) records installation tokens by scope and expiry only; it records no token length or value, so it adds no evidence on the shape.

### 4. Synthetic test values

As `test/review-findings.test.ts` does for `ghp_` (`` `ghp_${'a'.repeat(36)}` ``), the tests build their tokens at run time, `` `ghs_${'A1b2'.repeat(9)}` `` and `` `ghs_12345_${JWT}` `` with the existing synthetic JWT of the tests, so that no literal token sits in the source for a secret scanner to flag.

## Format evidence

Fetched on 2026-11-03. The raw sources of E1 and E4 are pinned to the `github/docs` commit they were read at; the other pages are unversioned and may change after that date. Quotes are verbatim; GitHub Docs markup variables such as `{% data variables.product.github %}` are kept as they appear in the source.

- **E1.** GitHub Docs, "About authentication to GitHub", section "GitHub's token formats", source `content/authentication/keeping-your-account-and-data-secure/about-authentication-to-github.md` of `github/docs` at commit `7fa55a0ac28d01b5cb6f9cbebff06fbee1e2408f` (<https://raw.githubusercontent.com/github/docs/7fa55a0ac28d01b5cb6f9cbebff06fbee1e2408f/content/authentication/keeping-your-account-and-data-secure/about-authentication-to-github.md>; rendered, unversioned page, at <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github#githubs-token-formats>):
  > {% data variables.product.company_short %} issues tokens that begin with a prefix to indicate the token's type.

  The table lists `ghp_` (personal access token, classic), `github_pat_` (fine-grained personal access token), `gho_` (OAuth access token), `ghu_` (user access token for a GitHub App), `ghs_` ("Installation access token for a {% data variables.product.prodname_github_app %}"), and `ghr_` (refresh token for a GitHub App). The same page includes the reusable E4.
- **E2.** GitHub Changelog, "Notice about upcoming new format for GitHub App installation tokens", 2026-04-24, unversioned page (<https://github.blog/changelog/2026-04-24-notice-about-upcoming-new-format-for-github-app-installation-tokens>):
  > If your application expects or relies on installation tokens being exactly 40 characters long, it may not handle this new token format correctly.

  > The overall length of the tokens will be longer (~520 characters) and will vary based on the data stored within it. The token format for installation tokens ( ghs_ tokens) will be changing to ghs_APPID_JWT . Note that the prefixes for any of the GitHub token types is not changing and installation tokens will still be prefixed with ghs_ .

  > There are no regexes in your codebase such as ghs_[A-Za-z0-9]{36} that validate a token. These may not match the new tokens.

  > Existing App installation tokens continue to work until they expire. This change applies to GitHub Enterprise Cloud and Data Residency environments. GitHub Enterprise Server isn’t impacted by this change.
- **E3.** GitHub Changelog, "GitHub App installation tokens: Per-request override header", 2026-05-15, edited 2026-05-26, unversioned page (<https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header>):
  > A stateless token is a ghs_ -prefixed JWT . It is longer (~520 characters) and contains two dots . In contrast, a stateful token is a short opaque string with no dots .

  > No hardcoded token length assumptions Any regex used to validate an installation token is updated to handle additional underscores and the presence of a JWT. Our recommended regex to match both new and current format tokens is ghs_[A-Za-z0-9\.\-_]{36,} .

  > Editor’s note (May 26th, 2026): Updated the regex format guidance.
- **E4.** GitHub Docs reusable `data/reusables/apps/ghs-stateless-token-format.md` of `github/docs` at commit `7fa55a0ac28d01b5cb6f9cbebff06fbee1e2408f` (<https://raw.githubusercontent.com/github/docs/7fa55a0ac28d01b5cb6f9cbebff06fbee1e2408f/data/reusables/apps/ghs-stateless-token-format.md>), included by E1 and by "Generating an installation access token for a GitHub App":
  > Starting April 27, 2026, {% data variables.product.github %} began a staged rollout of a stateless format (`ghs_APPID_JWT`) to all newly minted {% data variables.product.prodname_github_app %} installation tokens, making them more performant and improving the reliability of our API surface. If your application expects or relies on installation tokens being exactly 40 characters long, it may not handle this new token format correctly.
- **E5.** GitHub Blog, "Behind GitHub's new authentication token formats", 2021-04-05, updated 2023-05-10, unversioned page (<https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/>):
  > We are including specific 3 letter prefixes to represent each token, starting with a company signifier, gh , and the first letter of the token type. The results are: ghp for GitHub personal access tokens gho for OAuth access tokens ghu for GitHub user-to-server tokens ghs for GitHub server-to-server tokens ghr for refresh tokens

  > A 32 bit checksum in the last 6 digits of each token strikes the optimal balance between keeping the random token portion at a consistent entropy and enough confidence in the checksum.

  > We then encode the result with a Base62 implementation, using leading zeros for padding as needed.

  > [...] all without changing the token length.

  The blog states no token length or character set for the random part.

The changelog pages' quotes are their text as the page renders it, with the spaces that the page's inline markup leaves around code and links.

## Risks

- A token glued after a letter, digit, or `_` stays, for example after an escape such as a literal `\n` in serialized text. The brief requires that negative; a token in a marked position, such as a URL's user information or a `Bearer` value, is still redacted by those rules.
- A long identifier that starts with `ghs_` after a space or punctuation is redacted although it is no token. That needs `ghs_` and 36 more token characters, which ordinary log text rarely holds.
- GitHub may change the format again; E3's editor's note shows that its guidance moves. The rule then needs a new change.
