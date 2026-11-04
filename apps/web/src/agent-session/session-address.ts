// One text per session address, each identifier encoded, so a/b + c and
// a + b/c never share a storage name, a feed key, or a React key.
export function sessionAddress(projectId: string, sessionId: string): string {
  return `${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`;
}
