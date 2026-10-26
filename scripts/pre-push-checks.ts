// Node built-ins only, like the other hook helpers.

const DELETION = /^0+$/;
// A SHA-1 or SHA-256 object name.
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

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

function isDeletion(fields: readonly string[]): boolean {
  if (fields.length !== 4) return false;
  const [, localSha, , remoteSha] = fields;
  return OBJECT_ID.test(localSha) && OBJECT_ID.test(remoteSha) && DELETION.test(localSha);
}

// Invalid input never gets the delete-only bypass; the standard checks may
// refuse it before verify.
export function isDeleteOnlyPush(updates: string): boolean {
  const refs = pushedRefs(updates);
  return refs.length > 0 && refs.every(isDeletion);
}
