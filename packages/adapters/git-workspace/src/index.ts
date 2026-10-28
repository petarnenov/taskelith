export { NO_CRASH_POINTS, type CrashPointHook, type GitWorkspaceCrashPoint } from './crash-points.js';
export { checkCheckoutSafety } from './checkout-safety.js';
export { VerifiedGitClient, verifyGitClient } from './git-client-gate.js';
export {
  GIT_TIME_LIMIT_MS,
  GitRunner,
  MAX_GIT_TIME_LIMIT_MS,
  credentialForms,
  scrubCredential,
  systemGitTimer,
  type GitCommand,
  type GitOutput,
  type GitOutputParser,
  type GitTimer,
} from './git-runner.js';
export { GitWorkspaces, sha256IdentifierDigest, type GitWorkspaceOperations, type GitWorkspacesOptions } from './git-workspaces.js';
export { objectName, parseCommitParents, parseCommitTree, parseTreeObject, type GitObjectType, type TreeObjectEntry } from './git-objects.js';
export { indexInfo, indexMatchesTree, parseIndexEntries, type IndexEntry } from './index-entries.js';
export { entryAt, isPresent } from './presence.js';
export { parsePorcelainStatus, type PorcelainStatus, type StatusEntry, type StatusEntryKind } from './porcelain-status.js';
export { repositoryConfigText, resetRepositoryFiles, writeRepositoryConfig, type ObjectFormat } from './repository-config.js';
export { parseBatchObjects, readHeadTree, readVerified, snapshotTree, type ListedEntry, type ObjectRead } from './tree-listing.js';
