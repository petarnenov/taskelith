# G0 data namespace contract

Status: selected design conventions for future implementation; no application state or new CLI flags are created by this document. Applies to the owner-selected Linux/macOS worker scope. Native acceptance remains in [worker platforms](worker-platforms.md).

## Root selection

Future runtime composition roots resolve one absolute `dataRoot` before reading or writing application state. Precedence is explicit command/programmatic configuration, then nonempty `TASKELITH_DATA_DIR`, then the OS default below. A future CLI may expose an explicit root option only when its stateful commands are implemented; the current bootstrap CLI does not accept one.

| OS | Per-user default |
| --- | --- |
| Linux | `$XDG_DATA_HOME/taskelith` when XDG_DATA_HOME is an absolute nonempty path; otherwise `$HOME/.local/share/taskelith`. |
| macOS | `$HOME/Library/Application Support/Taskelith`. |

Linux placement follows the distinction between persistent application data and state/cache/runtime directories in the [XDG Base Directory specification](https://specifications.freedesktop.org/basedir-spec/latest/). macOS placement follows Apple's [Library/Application Support guidance](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html). Taskelith's precedence and subtrees below are project design decisions, not requirements imposed by those sources.

An explicit configuration containing an empty, relative, or unusable path must fail startup rather than fall back and create a second identity. An unset/empty TASKELITH_DATA_DIR is treated as absent; a nonempty relative or unusable value fails startup. Relative XDG_DATA_HOME is ignored per XDG; a valid absolute home directory is then required. Resolve relative process working directories independently; do not derive state from the repository checkout or infer a path from this documentation's location. Do not expand a literal tilde in a configured value implicitly.

Managed services must supply an explicit dedicated-account data root in their service configuration. The per-user defaults are not a system-wide service-installation promise. Select and verify service account ownership, backup, and storage behavior in installation work. Database, broker, and graph services use explicitly configured persistent volumes; they do not silently inherit a worker's root.

## Identity separation and subtrees

| Relative subtree | Owner and purpose |
| --- | --- |
| `control-plane/` | Installation identity/configuration references and local evidence storage when selected; canonical operational/knowledge records remain in the configured PostgreSQL service. |
| `worker/` | Local worker identity, installation binding, durable execution journal, and supervisor recovery records. |
| `worker/workspaces/` | Managed project/attempt workspaces; workspace removal must not delete the worker journal or accepted evidence. |

Subtree names establish ownership, not an already frozen on-disk schema. Version each runtime format before first use. Secrets, journals, accepted evidence, disposable caches, and mutable Git workspaces require separate retention and access rules. Durable control records must never live only in a cache or temporary directory.

The server bootstraps a new installation identity only through an explicit initialization flow. Worker enrollment binds a local worker identity to the authenticated installation; starting a worker must not create a control-plane installation automatically. Separate workers or installations on one host need distinct explicit roots. Colocated worker/control-plane processes may share a root only through distinct role-owned subtrees and the same validated installation binding; they still use the remote protocol.

Reject an incompatible installation binding, duplicate live worker owner, unknown newer format, untrusted ownership, or unsafe root redirection instead of silently adopting state. Root locks, symlink/ownership handling, atomic persistence, crash consistency, and credential generation/storage are G2 implementation and native-test obligations. Use qualified cryptography/OS facilities; these conventions do not implement them.

Do not copy or discover another product's identifiers, credentials, databases, workspaces, or user browser profiles. Do not automatically relocate an existing root when an environment variable or default changes. Relocation/re-enrollment requires an explicit procedure preserving ownership and recovery evidence.

## Repository and evidence exclusions

Application roots belong outside this checkout. Runtime configuration must refuse using the checkout or a subtree of it as dataRoot for the managed project; explicit state directories for future test fixtures are separate controlled temporary fixtures. Keep secret values and application state out of Git, npm tarballs, logs, lessons, browser bundles, and retained dependency inventories. Existing `.env*`, `.npmrc`, node_modules, dist, and tarball exclusions remain developer hygiene rather than runtime authorization.

The existing CLI continues to print help/version/the bundled plan without creating state. Path precedence, identity conflicts, root ownership, isolation, crash recovery, restore quarantine, and credential handling require tests when stateful runtime implementation begins. No such runtime tests are claimed here.
