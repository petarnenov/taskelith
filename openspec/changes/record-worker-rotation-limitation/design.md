## Context

G2's exit is a local single-host installation with failure scenarios. Delivering secrets to a worker is a channel between the control plane and a possibly remote worker, which G3 item 26 builds with TLS and remote enrollment.

## Decisions

- Defer delivery to G3 item 26 rather than add a temporary file-copy path in G2 that G3 would replace.
- Record the limitation where an operator and the closure will read it: the contract's rotation rules, the G2 plan, and G3 item 26's scope.
