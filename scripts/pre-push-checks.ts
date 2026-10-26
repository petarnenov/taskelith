// Node built-ins only, like the other hook helpers.

// Any length, so that SHA-256 repositories match too.
const DELETION = /^0+$/;

// Exit status of check-pre-push.ts that tells .githooks/pre-push to skip
// make verify; Node.js, sh, and the wrappers use no such status.
export const DELETE_ONLY_PUSH_STATUS = 100;

// git passes one "<local ref> <sha> <remote ref> <sha>" per pushed ref.
function pushedRefs(updates: string): string[][] {
  return updates.split('\n').filter(line => line.trim() !== '')
    .map(line => line.trim().split(/\s+/));
}

// make verify checks the checked-out commit, so every other pushed commit is
// unverified.
export function unverifiedPushRefs(updates: string, head: string): string[] {
  return pushedRefs(updates)
    .filter(([, localSha]) => !DELETION.test(localSha) && localSha !== head)
    .map(([localRef]) => localRef);
}

// A push without any ref is not delete-only, so it still runs make verify.
export function isDeleteOnlyPush(updates: string): boolean {
  const refs = pushedRefs(updates);
  return refs.length > 0 && refs.every(([, localSha]) => DELETION.test(localSha));
}
