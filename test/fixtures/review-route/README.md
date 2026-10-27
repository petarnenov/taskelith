# Review route fixtures

`jev-systemone-response.json` is constructed from the documentation, not captured from a live call. It follows the `SystemOneResponse`, `ChoiceAnswer`, and `ScoreAnswer` schemas and the response examples of the TypeSafe AI OpenAPI document (`https://api.typesafe.ai/openapi.json`, unversioned page, OpenAPI `info.version` 0.2.0, SHA-256 prefix `3ca93b6e6b9aa8d7`, read on 2026-10-28), answering the two questions that `scripts/review-route-jev.ts` asks. Its numbers are invented: the score 1.4 is the probability-weighted level of its score probabilities.

No live call has been made: the owner has not yet confirmed the account, the Master Customer Agreement, credits, and data consent (the OpenSpec change `route-reviewers-by-change-complexity`, `design.md` "Owner actions"). After the first real call, a captured response, with no credential in it, replaces this file.
