export { NO_CRASH_POINTS, type CrashPointHook, type GitWorkspaceCrashPoint } from './crash-points.js';
export { checkCheckoutSafety } from './checkout-safety.js';
export { VerifiedGitClient, verifyGitClient } from './git-client-gate.js';
export { GitRunner, scrubCredential, type GitCommand, type GitOutput } from './git-runner.js';
export { GitWorkspaces, sha256IdentifierDigest, type GitWorkspacesOptions, type LocalWorkspaceOperations } from './git-workspaces.js';
export { parsePorcelainStatus, type PorcelainStatus, type StatusEntry, type StatusEntryKind } from './porcelain-status.js';
export { repositoryConfigText, writeRepositoryConfig, type ObjectFormat } from './repository-config.js';
export { parseBatchObjects, parseTreeListing, snapshotTree, type ListedEntry } from './tree-listing.js';
